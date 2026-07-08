import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth-user';

const TOKEN_PREFIX = 'jrv_';

@Injectable()
export class ApiTokensService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Create a token. Returns the plaintext ONCE (never stored in clear). */
  async create(userId: string, name: string): Promise<{ id: string; token: string; prefix: string }> {
    const token = `${TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
    const prefix = `${token.slice(0, 10)}…`;
    const row = await this.prisma.apiToken.create({
      data: { userId, name: name || 'Obsidian', tokenHash: this.hash(token), prefix, scope: 'sync' },
    });
    return { id: row.id, token, prefix };
  }

  async list(userId: string) {
    return this.prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, scope: true, lastUsedAt: true, createdAt: true },
    });
  }

  async revoke(userId: string, id: string) {
    await this.prisma.apiToken.deleteMany({ where: { id, userId } });
    return { revoked: true };
  }

  /** Verify a bearer token and resolve its user (or null). Touches lastUsedAt. */
  async resolve(token: string): Promise<AuthUser | null> {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (!row) return null;
    // Best-effort last-used stamp (don't block auth on it).
    this.prisma.apiToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return { id: row.user.id, email: row.user.email };
  }

  static looksLikeApiToken(bearer: string): boolean {
    return bearer.startsWith(TOKEN_PREFIX);
  }
}
