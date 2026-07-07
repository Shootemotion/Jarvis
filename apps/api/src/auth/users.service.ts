import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { AuthUser } from './auth-user';

/**
 * Resolves/provisions the app user. In selfhost mode there is a single seeded
 * user; in cloud mode each Supabase identity is provisioned on first request.
 */
@Injectable()
export class UsersService {
  private selfHostUser: AuthUser | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async getSelfHostUser(): Promise<AuthUser> {
    if (this.selfHostUser) return this.selfHostUser;
    const email = this.config.env.JARVIS_USER_EMAIL;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        `Usuario ${email} no encontrado. ¿Corriste el seed (pnpm db:seed)?`,
      );
    }
    this.selfHostUser = { id: user.id, email: user.email };
    return this.selfHostUser;
  }

  /** Find-or-create a user from a verified Supabase identity. */
  async provisionFromAuth(authId: string, email?: string | null): Promise<AuthUser> {
    const byAuth = await this.prisma.user.findUnique({ where: { authId } });
    if (byAuth) return { id: byAuth.id, email: byAuth.email };

    // Link a pre-existing user with the same email (e.g. migrated seed user).
    if (email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        const linked = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { authId },
        });
        return { id: linked.id, email: linked.email };
      }
    }

    // Brand-new user → create + seed default projects.
    const created = await this.prisma.user.create({
      data: {
        authId,
        email: email ?? null,
        name: email?.split('@')[0] ?? 'Usuario',
        preferredLanguage: 'es',
      },
    });
    await this.prisma.project.createMany({
      data: [
        { userId: created.id, name: 'JARVIS' },
        { userId: created.id, name: 'General' },
      ],
    });
    // New users start on the Free plan.
    const freePlan = await this.prisma.plan.findUnique({ where: { key: 'free' } });
    if (freePlan) {
      await this.prisma.subscription.create({
        data: { userId: created.id, planId: freePlan.id, status: 'active' },
      });
    }
    return { id: created.id, email: created.email };
  }
}
