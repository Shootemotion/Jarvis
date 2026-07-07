import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { AuthUser } from '../auth/auth-user';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Start an upgrade to Pro. Returns a URL to redirect the browser to. */
  @Post('checkout')
  checkout(@CurrentUser() user: AuthUser) {
    return this.billing.createCheckout(user.id, user.email);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.billing.getStatus(user.id);
  }

  @Post('cancel')
  async cancel(@CurrentUser() user: AuthUser) {
    await this.billing.cancel(user.id);
    return { ok: true };
  }

  /** DEV only (no MP token): simulate a successful payment. */
  @Post('dev-confirm')
  async devConfirm(@CurrentUser() user: AuthUser) {
    await this.billing.devConfirm(user.id);
    return { ok: true };
  }

  /** Mercado Pago webhook (no auth — verified via signature). */
  @Public()
  @Post('webhook')
  webhook(
    @Query() query: Record<string, string | undefined>,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.billing.handleWebhook(query, body ?? {}, headers);
  }
}
