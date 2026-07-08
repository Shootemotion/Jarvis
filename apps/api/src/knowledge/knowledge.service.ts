import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import matter from 'gray-matter';
import AdmZip from 'adm-zip';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';

export interface KnowledgeHit {
  id: string;
  documentId: string;
  path: string;
  heading: string | null;
  content: string;
  score: number;
}

interface IncomingFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface IngestOptions {
  projectId?: string;
  excludedFolders?: string[];
  allowListFolders?: string[];
}

interface RawDoc {
  path: string;
  raw: string;
  bytes: number;
}

// Limits (Fase A). Ready to lift into a queue (BullMQ) later.
const MAX_MD_BYTES = 2 * 1024 * 1024; // 2 MB per markdown file
const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60 MB per upload
const MAX_FILES = 2000;
const MAX_CHUNK_CHARS = 1400;

// Always-ignored folders (privacy / noise). Extendable per-upload.
const DEFAULT_EXCLUDED = [
  '.obsidian/',
  '.git/',
  'node_modules/',
  'attachments/',
  'private/',
  'secrets/',
];

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
  ) {}

  // ---- ingestion ----------------------------------------------------------

  async ingest(userId: string, files: IncomingFile[], opts: IngestOptions = {}) {
    if (!this.registry.hasEmbedding()) {
      throw new Error(
        'No hay proveedor de embeddings configurado. Definí EMBEDDING_API_KEY (OpenAI) o EMBEDDING_PROVIDER=local.',
      );
    }

    // Resolve incoming files → markdown docs, collecting what we skip and why.
    const docs: RawDoc[] = [];
    const ignored: { path: string; reason: string }[] = [];
    let totalBytes = 0;

    const tryPush = (path: string, raw: string, bytes: number) => {
      if (docs.length >= MAX_FILES) {
        ignored.push({ path, reason: `límite de ${MAX_FILES} archivos` });
        return;
      }
      if (bytes > MAX_MD_BYTES) {
        ignored.push({ path, reason: 'archivo demasiado grande (>2MB)' });
        return;
      }
      if (totalBytes + bytes > MAX_TOTAL_BYTES) {
        ignored.push({ path, reason: 'límite total de subida (60MB)' });
        return;
      }
      totalBytes += bytes;
      docs.push({ path: this.normalizePath(path), raw, bytes });
    };

    for (const f of files) {
      const isZip = f.mimetype.includes('zip') || /\.zip$/i.test(f.originalname);
      if (isZip) {
        const expanded = this.expandZip(f.buffer, opts);
        ignored.push(...expanded.ignored);
        for (const d of expanded.docs) tryPush(d.path, d.raw, d.bytes);
      } else if (/\.(md|markdown)$/i.test(f.originalname)) {
        const reason = this.ignoreReason(f.originalname, opts);
        if (reason) ignored.push({ path: f.originalname, reason });
        else tryPush(f.originalname, f.buffer.toString('utf8'), f.size);
      } else {
        ignored.push({ path: f.originalname, reason: 'solo se aceptan .md en esta fase' });
      }
    }

    // Create the ingestion job (synchronous processing; BullMQ-ready).
    const job = await this.prisma.ingestionJob.create({
      data: {
        userId,
        projectId: opts.projectId ?? null,
        source: 'obsidian',
        status: 'processing',
        totalFiles: docs.length,
      },
    });

    const results: { path: string; status: string; chunks: number }[] = [];
    let processed = 0;
    let failed = 0;
    for (const d of docs) {
      try {
        const r = await this.ingestOne(userId, d, opts.projectId);
        results.push(r);
        if (r.status === 'error') failed++;
        else processed++;
      } catch (err) {
        this.logger.error(`Ingest ${d.path}: ${String(err)}`);
        results.push({ path: d.path, status: 'error', chunks: 0 });
        failed++;
      }
    }

    await this.prisma.ingestionJob.update({
      where: { id: job.id },
      data: {
        status: failed > 0 && processed === 0 ? 'failed' : 'completed',
        processedFiles: processed,
        failedFiles: failed,
        completedAt: new Date(),
      },
    });

    return { jobId: job.id, total: docs.length, processed, failed, documents: results, ignored };
  }

  /** Idempotent single-file ingest keyed by (userId, source, projectId, path) + contentHash. */
  private async ingestOne(userId: string, d: RawDoc, projectId?: string) {
    const hash = createHash('sha256').update(d.raw).digest('hex');

    const existing = await this.prisma.document.findFirst({
      where: { userId, source: 'obsidian', path: d.path, projectId: projectId ?? null },
    });
    // Unchanged → skip (idempotent).
    if (existing && existing.contentHash === hash && existing.status === 'indexed') {
      return { path: d.path, status: 'unchanged', chunks: existing.chunkCount };
    }

    const parsed = matter(d.raw);
    const fm = parsed.data as Record<string, unknown>;
    if (fm.private === true) {
      return { path: d.path, status: 'skipped_private', chunks: 0 };
    }
    const content = parsed.content;
    const tags = this.extractTags(fm, content);
    const title =
      (typeof fm.title === 'string' && fm.title) || this.firstH1(content) || this.basename(d.path);

    const doc = existing
      ? await this.prisma.document.update({
          where: { id: existing.id },
          data: { title, tags, bytes: d.bytes, contentHash: hash, status: 'indexing' },
        })
      : await this.prisma.document.create({
          data: {
            userId,
            projectId: projectId ?? null,
            source: 'obsidian',
            title,
            path: d.path,
            mime: 'text/markdown',
            tags,
            bytes: d.bytes,
            contentHash: hash,
            status: 'indexing',
          },
        });

    await this.prisma.documentChunk.deleteMany({ where: { documentId: doc.id } });

    const parts = this.chunkMarkdown(content);
    let ord = 0;
    for (const part of parts) {
      const embedInput = part.heading ? `${part.heading}\n${part.content}` : part.content;
      const emb = await this.registry.embed(embedInput);
      const chunk = await this.prisma.documentChunk.create({
        data: {
          documentId: doc.id,
          userId,
          projectId: projectId ?? null,
          source: 'obsidian',
          path: d.path,
          heading: part.heading,
          tags,
          ord: ord++,
          content: part.content,
        },
      });
      const vec = `[${emb.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE document_chunks SET embedding = ${vec}::vector WHERE id = ${chunk.id}::uuid
      `;
    }

    await this.prisma.document.update({
      where: { id: doc.id },
      data: { status: 'indexed', chunkCount: parts.length },
    });
    return { path: d.path, status: 'indexed', chunks: parts.length };
  }

  /** Expand a zip into markdown docs, applying security + ignore rules. */
  private expandZip(buffer: Buffer, opts: IngestOptions) {
    const docs: RawDoc[] = [];
    const ignored: { path: string; reason: string }[] = [];
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      return { docs, ignored: [{ path: '(zip)', reason: 'zip inválido' }] };
    }
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      const reason = this.ignoreReason(name, opts);
      if (reason) {
        ignored.push({ path: name, reason });
        continue;
      }
      const data = entry.getData();
      docs.push({ path: this.normalizePath(name), raw: data.toString('utf8'), bytes: data.length });
    }
    return { docs, ignored };
  }

  /** Returns a reason string if the path must be ignored, or null if allowed. */
  private ignoreReason(rawPath: string, opts: IngestOptions): string | null {
    const p = rawPath.replace(/\\/g, '/');
    if (p.includes('\0')) return 'path inválido';
    if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return 'ruta absoluta';
    const segs = p.split('/');
    if (segs.some((s) => s === '..')) return 'path traversal (..)';
    if (segs.some((s) => s.startsWith('.') && s.length > 1)) return 'archivo/carpeta oculto';
    if (!/\.(md|markdown)$/i.test(p)) return 'no es .md';
    const lower = p.toLowerCase();
    const excluded = [...DEFAULT_EXCLUDED, ...(opts.excludedFolders ?? [])];
    if (excluded.some((f) => lower.includes(f.toLowerCase().replace(/\/?$/, '/')))) {
      return 'carpeta excluida';
    }
    const allow = opts.allowListFolders?.filter(Boolean);
    if (allow?.length) {
      const ok = allow.some((f) => lower.startsWith(f.toLowerCase().replace(/\/?$/, '/')));
      if (!ok) return 'fuera de la allow-list';
    }
    return null;
  }

  private normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  }

  // ---- parsing helpers ----------------------------------------------------

  private chunkMarkdown(content: string): { heading: string | null; content: string }[] {
    const lines = content.split(/\r?\n/);
    const chunks: { heading: string | null; content: string }[] = [];
    let heading: string | null = null;
    let buf: string[] = [];
    const flush = () => {
      const text = buf.join('\n').trim();
      if (text) chunks.push({ heading, content: text });
      buf = [];
    };
    for (const line of lines) {
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        flush();
        heading = h[2].trim();
        continue;
      }
      buf.push(line);
      if (buf.join('\n').length >= MAX_CHUNK_CHARS) flush();
    }
    flush();
    return chunks;
  }

  private extractTags(fm: Record<string, unknown>, content: string): string[] {
    const set = new Set<string>();
    const fmTags = fm.tags;
    if (Array.isArray(fmTags)) fmTags.forEach((t) => typeof t === 'string' && set.add(t));
    else if (typeof fmTags === 'string') fmTags.split(/[,\s]+/).forEach((t) => t && set.add(t));
    for (const m of content.matchAll(/(?:^|\s)#([\p{L}\d/_-]{2,})/gu)) set.add(m[1]);
    return [...set].slice(0, 30);
  }

  private firstH1(content: string): string | null {
    const m = content.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : null;
  }

  private basename(path: string): string {
    return path.split('/').pop()?.replace(/\.(md|markdown|txt)$/i, '') ?? path;
  }

  // ---- query --------------------------------------------------------------

  list(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        path: true,
        source: true,
        tags: true,
        status: true,
        chunkCount: true,
        updatedAt: true,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.document.deleteMany({ where: { id, userId } });
    return { deleted: true };
  }

  async search(
    userId: string,
    query: string,
    projectId?: string,
    limit = 6,
  ): Promise<KnowledgeHit[]> {
    if (!this.registry.hasEmbedding()) return [];
    const vec = `[${(await this.registry.embed(query)).join(',')}]`;
    const conds: Prisma.Sql[] = [
      Prisma.sql`user_id = ${userId}::uuid`,
      Prisma.sql`embedding IS NOT NULL`,
    ];
    if (projectId) conds.push(Prisma.sql`project_id = ${projectId}::uuid`);
    const where = Prisma.join(conds, ' AND ');
    return this.prisma.$queryRaw<KnowledgeHit[]>`
      SELECT id, document_id AS "documentId", path, heading, content,
             1 - (embedding <=> ${vec}::vector) AS score
      FROM document_chunks
      WHERE ${where}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    `;
  }
}
