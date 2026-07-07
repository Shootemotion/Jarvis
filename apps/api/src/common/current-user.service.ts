import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';

/**
 * Single-user MVP: there is no auth. The "current user" is the one seeded from
 * JARVIS_USER_EMAIL. This service resolves and caches that user's id so the
 * rest of the app can scope data to it. When real auth arrives, only this
 * service changes.
 */
@Injectable()
export class CurrentUserService {
  private cachedId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async getUserId(): Promise<string> {
    if (this.cachedId) return this.cachedId;

    const email = this.config.env.JARVIS_USER_EMAIL;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        `Usuario ${email} no encontrado. ¿Corriste el seed (pnpm db:seed)?`,
      );
    }
    this.cachedId = user.id;
    return user.id;
  }
}
