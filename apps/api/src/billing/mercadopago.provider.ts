import { Logger } from '@nestjs/common';
import {
  BillingProvider,
  CheckoutParams,
  CheckoutResult,
  RemoteSubscription,
} from './billing-provider';

const MP_API = 'https://api.mercadopago.com';

/** Maps Mercado Pago preapproval statuses to our normalized set. */
function normalizeStatus(s: string | undefined): RemoteSubscription['status'] {
  switch (s) {
    case 'authorized':
      return 'active';
    case 'pending':
      return 'pending';
    case 'paused':
      return 'paused';
    case 'cancelled':
    case 'canceled':
      return 'canceled';
    default:
      return 'unknown';
  }
}

/**
 * Mercado Pago "Suscripciones" (preapproval) integration via REST.
 * Uses recurring preapprovals without an associated plan, so the amount/currency
 * come from our config and each user gets their own preapproval.
 */
export class MercadoPagoProvider implements BillingProvider {
  readonly name = 'mercadopago';
  private readonly logger = new Logger(MercadoPagoProvider.name);

  constructor(private readonly accessToken: string) {}

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${MP_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.error(`MP ${path} → ${res.status}: ${JSON.stringify(body)}`);
      throw new Error(
        (body as { message?: string })?.message ?? `Mercado Pago error ${res.status}`,
      );
    }
    return body as T;
  }

  async createSubscription(params: CheckoutParams): Promise<CheckoutResult> {
    const auto_recurring: Record<string, unknown> = {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: params.amountArs,
      currency_id: 'ARS',
    };
    if (params.trialDays > 0) {
      auto_recurring.free_trial = { frequency: params.trialDays, frequency_type: 'days' };
    }

    const body = {
      reason: params.reason,
      external_reference: params.userId,
      payer_email: params.email ?? undefined,
      back_url: params.backUrl,
      status: 'pending',
      auto_recurring,
    };

    const res = await this.call<{ id: string; init_point?: string; sandbox_init_point?: string }>(
      '/preapproval',
      { method: 'POST', body: JSON.stringify(body) },
    );
    const initPoint = res.init_point ?? res.sandbox_init_point;
    if (!res.id || !initPoint) {
      throw new Error('Mercado Pago no devolvió init_point.');
    }
    return { externalId: res.id, initPoint };
  }

  async getSubscription(externalId: string): Promise<RemoteSubscription> {
    const res = await this.call<{ status?: string; external_reference?: string }>(
      `/preapproval/${externalId}`,
      { method: 'GET' },
    );
    return {
      externalId,
      status: normalizeStatus(res.status),
      externalReference: res.external_reference,
      raw: res,
    };
  }

  async cancelSubscription(externalId: string): Promise<void> {
    await this.call(`/preapproval/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    });
  }
}
