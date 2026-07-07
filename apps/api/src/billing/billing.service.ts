import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { BillingProvider } from './billing-provider';
import { MercadoPagoProvider } from './mercadopago.provider';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly provider: BillingProvider | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {
    const token = this.config.billing.mpAccessToken;
    this.provider = token ? new MercadoPagoProvider(token) : null;
    if (!this.provider) {
      this.logger.warn(
        'MP_ACCESS_TOKEN no configurado → billing en modo DEV (checkout simulado, activa Pro localmente).',
      );
    }
  }

  /** Live (real Mercado Pago) vs dev/mock. */
  get isLive(): boolean {
    return !!this.provider;
  }

  /**
   * Start an upgrade. In live mode returns the Mercado Pago init_point to redirect
   * to. In dev mode returns a local URL that instantly activates Pro for testing.
   */
  async createCheckout(userId: string, email: string | null): Promise<{ url: string; mock: boolean }> {
    const current = await this.entitlementPlanKey(userId);
    if (current === 'pro') throw new BadRequestException('Ya tenés el plan Pro activo.');

    const { proPriceArs, proTrialDays, webUrl } = this.config.billing;

    if (!this.provider) {
      // Dev mode: no MP token. Point to a local confirm endpoint.
      return { url: `${webUrl}/settings/billing?mock=1`, mock: true };
    }

    const result = await this.provider.createSubscription({
      userId,
      email,
      amountArs: proPriceArs,
      reason: 'JARVIS Pro',
      backUrl: `${webUrl}/settings/billing?status=return`,
      trialDays: proTrialDays,
    });

    // Remember the pending preapproval so the webhook can reconcile it.
    await this.prisma.subscription.update({
      where: { userId },
      data: { mpPreapprovalId: result.externalId },
    });
    await this.recordPayment(userId, {
      kind: 'preapproval',
      status: 'pending',
      externalId: result.externalId,
      amount: proPriceArs,
      currency: 'ARS',
    });

    return { url: result.initPoint, mock: false };
  }

  /**
   * Handle a Mercado Pago webhook. Verifies the signature (when a secret is set),
   * fetches the current preapproval status and activates/cancels accordingly.
   */
  async handleWebhook(
    query: Record<string, string | undefined>,
    body: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): Promise<{ ok: true }> {
    if (!this.provider) {
      this.logger.warn('Webhook recibido sin MP configurado — ignorado.');
      return { ok: true };
    }

    const type = (body?.type as string) ?? query.type ?? query.topic;
    const dataId =
      ((body?.data as { id?: string })?.id) ?? query['data.id'] ?? query.id;

    if (!dataId) {
      this.logger.warn(`Webhook sin data.id (type=${type}) — ignorado.`);
      return { ok: true };
    }

    this.verifySignature(headers, dataId);

    // Only preapproval events change subscription state here.
    if (type && !String(type).includes('preapproval')) {
      this.logger.log(`Webhook type=${type} ignorado (no es preapproval).`);
      return { ok: true };
    }

    const remote = await this.provider.getSubscription(dataId);
    const userId = remote.externalReference;
    if (!userId) {
      this.logger.warn(`Preapproval ${dataId} sin external_reference — no puedo mapear usuario.`);
      return { ok: true };
    }

    if (remote.status === 'active') {
      await this.activatePro(userId, dataId);
    } else if (remote.status === 'canceled' || remote.status === 'paused') {
      await this.downgradeToFree(userId, dataId);
    }
    await this.recordPayment(userId, {
      kind: 'preapproval',
      status: remote.status,
      externalId: dataId,
      raw: remote.raw,
    });
    return { ok: true };
  }

  /** Dev-only: simulate a successful payment (used when MP is not configured). */
  async devConfirm(userId: string): Promise<void> {
    if (this.isLive) throw new BadRequestException('Confirmación manual sólo disponible en modo DEV.');
    await this.activatePro(userId, `dev-${userId}`);
    await this.recordPayment(userId, {
      kind: 'payment',
      status: 'active',
      externalId: `dev-${userId}`,
      amount: this.config.billing.proPriceArs,
      currency: 'ARS',
    });
  }

  /** Cancel the active subscription (both remotely and locally). */
  async cancel(userId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (sub?.mpPreapprovalId && this.provider) {
      await this.provider.cancelSubscription(sub.mpPreapprovalId).catch((e) => {
        this.logger.error(`No se pudo cancelar en MP: ${e}`);
      });
    }
    await this.downgradeToFree(userId, sub?.mpPreapprovalId ?? undefined);
  }

  async getStatus(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, kind: true, status: true, amount: true, currency: true, createdAt: true },
    });
    return {
      plan: sub?.plan.key ?? 'free',
      status: sub?.status ?? 'active',
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      live: this.isLive,
      price: { ars: this.config.billing.proPriceArs, trialDays: this.config.billing.proTrialDays },
      payments,
    };
  }

  // ---- internals -----------------------------------------------------------

  private async entitlementPlanKey(userId: string): Promise<string> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    if (sub && (sub.status === 'active' || sub.status === 'trialing')) return sub.plan.key;
    return 'free';
  }

  private async activatePro(userId: string, externalId: string): Promise<void> {
    const pro = await this.prisma.plan.findUnique({ where: { key: 'pro' } });
    if (!pro) throw new NotFoundException('Plan Pro no encontrado (¿corriste el seed?).');

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        planId: pro.id,
        status: 'active',
        currentPeriodEnd: periodEnd,
        mpPreapprovalId: externalId,
      },
      create: {
        userId,
        planId: pro.id,
        status: 'active',
        currentPeriodEnd: periodEnd,
        mpPreapprovalId: externalId,
      },
    });
    this.logger.log(`Usuario ${userId} → Pro (preapproval ${externalId}).`);
  }

  private async downgradeToFree(userId: string, externalId?: string): Promise<void> {
    const free = await this.prisma.plan.findUnique({ where: { key: 'free' } });
    if (!free) return;
    await this.prisma.subscription.upsert({
      where: { userId },
      update: { planId: free.id, status: 'canceled', mpPreapprovalId: externalId ?? null },
      create: { userId, planId: free.id, status: 'active' },
    });
    this.logger.log(`Usuario ${userId} → Free (cancelado).`);
  }

  private async recordPayment(
    userId: string,
    p: {
      kind: string;
      status: string;
      externalId?: string;
      amount?: number;
      currency?: string;
      raw?: unknown;
    },
  ): Promise<void> {
    await this.prisma.payment.create({
      data: {
        userId,
        provider: this.provider?.name ?? 'dev',
        kind: p.kind,
        status: p.status,
        externalId: p.externalId ?? null,
        amount: p.amount ?? null,
        currency: p.currency ?? null,
        raw: (p.raw as object) ?? undefined,
      },
    });
  }

  /**
   * Mercado Pago webhook signature check. Only enforced when MP_WEBHOOK_SECRET is
   * configured. Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
   */
  private verifySignature(headers: Record<string, string | undefined>, dataId: string): void {
    const secret = this.config.billing.mpWebhookSecret;
    if (!secret) return; // verification disabled

    const sig = headers['x-signature'];
    const requestId = headers['x-request-id'];
    if (!sig) throw new BadRequestException('Falta x-signature.');

    const parts = Object.fromEntries(
      sig.split(',').map((kv) => kv.split('=').map((s) => s.trim()) as [string, string]),
    );
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) throw new BadRequestException('x-signature malformado.');

    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ''};ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Firma de webhook inválida.');
    }
  }
}
