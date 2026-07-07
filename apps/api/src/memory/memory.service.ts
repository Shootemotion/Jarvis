import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { CreateMemoryDto, SearchMemoryDto, UpdateMemoryDto } from './dto';

export interface MemorySearchResult {
  id: string;
  type: string;
  content: string;
  projectId: string | null;
  tags: string[];
  confidence: number;
  score: number;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
  ) {}

  /** pgvector text literal, e.g. "[0.12,0.34,...]". */
  private toVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  private async writeEmbedding(id: string, content: string) {
    const embedding = await this.registry.embed(content);
    const vec = this.toVector(embedding);
    await this.prisma.$executeRaw`
      UPDATE memories SET embedding = ${vec}::vector WHERE id = ${id}::uuid
    `;
  }

  async create(userId: string, dto: CreateMemoryDto) {
    const memory = await this.prisma.memory.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        type: dto.type,
        content: dto.content,
        source: dto.source ?? 'manual',
        confidence: dto.confidence ?? 1.0,
        tags: dto.tags ?? [],
        visibility: dto.visibility ?? 'private',
        canBeUsedAutomatically: dto.canBeUsedAutomatically ?? true,
      },
    });
    await this.writeEmbedding(memory.id, memory.content);
    return memory;
  }

  list(userId: string, filter: { type?: string; projectId?: string }) {
    return this.prisma.memory.findMany({
      where: {
        userId,
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateMemoryDto) {
    await this.ensureOwned(userId, id);
    const updated = await this.prisma.memory.update({
      where: { id },
      data: {
        type: dto.type,
        content: dto.content,
        projectId: dto.projectId,
        tags: dto.tags,
        visibility: dto.visibility,
        canBeUsedAutomatically: dto.canBeUsedAutomatically,
        confidence: dto.confidence,
      },
    });
    // Re-embed only when the content changed.
    if (dto.content != null) {
      await this.writeEmbedding(id, dto.content);
    }
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.memory.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Semantic search over the user's memories. `automaticOnly` restricts to
   * memories flagged for automatic use (used by the chat context builder).
   */
  async search(
    userId: string,
    dto: SearchMemoryDto,
    automaticOnly = false,
  ): Promise<MemorySearchResult[]> {
    const qvec = this.toVector(await this.registry.embed(dto.query));
    const limit = dto.limit ?? 5;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`user_id = ${userId}::uuid`,
      Prisma.sql`embedding IS NOT NULL`,
    ];
    if (dto.projectId)
      conditions.push(Prisma.sql`project_id = ${dto.projectId}::uuid`);
    if (dto.type) conditions.push(Prisma.sql`type = ${dto.type}`);
    if (automaticOnly)
      conditions.push(Prisma.sql`can_be_used_automatically = true`);

    const where = Prisma.join(conditions, ' AND ');

    const rows = await this.prisma.$queryRaw<MemorySearchResult[]>`
      SELECT id, type, content, project_id AS "projectId", tags, confidence,
             1 - (embedding <=> ${qvec}::vector) AS score
      FROM memories
      WHERE ${where}
      ORDER BY embedding <=> ${qvec}::vector
      LIMIT ${limit}
    `;
    return rows;
  }

  private async ensureOwned(userId: string, id: string) {
    const memory = await this.prisma.memory.findFirst({ where: { id, userId } });
    if (!memory) throw new NotFoundException('Memoria no encontrada.');
    return memory;
  }
}
