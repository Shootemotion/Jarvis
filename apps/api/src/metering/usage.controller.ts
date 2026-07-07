import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { UsageService } from './usage.service';

@Controller('usage')
export class UsageController {
  constructor(
    private readonly usage: UsageService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const [usage, entitlements] = await Promise.all([
      this.usage.monthUsage(user.id),
      this.entitlements.getForUser(user.id),
    ]);
    return {
      usage,
      limits: entitlements.limits,
      plan: entitlements.plan,
    };
  }
}
