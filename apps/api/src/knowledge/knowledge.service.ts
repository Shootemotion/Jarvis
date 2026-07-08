import { Injectable, Logger } from '@nestjs/common';
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

/** One raw markdown file resolved from an upload (single .md or a .zip entry). */
interface RawDoc {
  path: string;
  raw: string;
  bytes: number;
}

const MAX_CHUNK_CHARS = 1400;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
  ) {}

  // ---- ingestion ----------------------------------------------------------

  /** Ingest uploaded files: individual .md/.txt or a .zip of an Obsidian vault. */
  async ingest(userId: string, files: IncomingFile[], projectId?: string) {
    if (!this.registry.hasEmbedding()) {
      throw new Error(
        'No hay proveedor de embeddings configurado. Definí EMBEDDING_API_KEY (OpenAI) o EMBEDDING_PROVIDER=local.',
      );
    }
    const docs: RawDoc[] = [];
    for (const f of files) {
      const isZip =
        f.mimetype.includes('zip') || f.originalname.toLowerCase().endsWith('.zip');
      if (isZip) {
        docs.push(...this.expandZip(f.buffer));
      } else if (/\.(md|markdown|txt)$/i.test(f.originalname)) {
        docs.push({ path: f.originalname, raw: f.buffer.toString('utf8'), bytes: f.size });
      }
    }

    const results: { path: string; status: string; chunks: number }[] = [];
    for (const d of docs) {
      try {
        const doc = await this.ingestOne(userId, d, projectId);
        results.push({ path: d.path, status: doc.status, chunks: doc.chunkCount });
      } catch (err) {
        this.logger.error(`Ingest ${d.path}: ${String(err)}`);
        results.push({ path: d.path, status: 'error', chunks: 0 });
      }
    }
    return { ingested: results.length, documents: results };
  }

  /** Extract markdown entries from a zip, skipping .obsidian/, hidden and attachments. */
  private expandZip(buffer: Buffer): RawDoc[] {
    const out: RawDoc[] = [];
    const zip = new AdmZip(buffer);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (name.includes('/.') || name.startsWith('.') || name.includes('.obsidian/')) continue;
      if (!/\.(md|markdown)$/i.test(name)) continue;
      const raw = entry.getData().toString('utf8');
      out.push({ path: name, raw, bytes: raw.length });
    }
    return out;
  }

  private async ingestOne(userId: string, d: RawDoc, projectId?: string) {
    const parsed = matter(d.raw);
    const content = parsed.content;
    const fm = parsed.data as Record<string, unknown>;
    const tags = this.extractTags(fm, content);
    const title = (typeof fm.title === 'string' && fm.title) || this.firstH1(content) || this.basename(d.path);

    const doc = await this.prisma.document.upsert({
      where: { userId_source_path: { userId, source: 'obsidian', path: d.path } },
      create: {
        userId,
        projectId: projectId ?? null,
        source: 'obsidian',
        title,
        path: d.path,
        mime: 'text/markdown',
        tags,
        bytes: d.bytes,
        status: 'indexing',
      },
      update: { title, tags, bytes: d.bytes, status: 'indexing', projectId: projectId ?? null },
    });

    // Re-index: drop previous chunks for this document.
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

    return this.prisma.document.update({
      where: { id: doc.id },
      data: { status: 'indexed', chunkCount: parts.length },
    });
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

  async list(userId: string) {
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

  /** Semantic search over the user's document chunks. */
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
