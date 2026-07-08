import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { toolsForPlan } from './tools.registry';

@Controller('orchestrator')
export class OrchestratorController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Tools available to the current user's plan (with capabilities/metadata). */
  @Get('tools')
  async tools(@CurrentUser() user: AuthUser) {
    const e = await this.entitlements.getForUser(user.id);
    return toolsForPlan(e.plan === 'pro' ? 'pro' : 'free');
  }

  /** Recent orchestrator decisions (audit). */
  @Get('recent')
  recent(@CurrentUser() user: AuthUser) {
    return this.prisma.actionLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
