import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { EntitlementsService } from './entitlements.service';

@Controller('me')
export class MeController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    return {
      user,
      entitlements: await this.entitlements.getForUser(user.id),
    };
  }
}
