/**
 * Provider-agnostic billing contract. Today only Mercado Pago implements it;
 * Stripe (international) can be added later without touching BillingService.
 */

export interface CheckoutParams {
  userId: string;
  email: string | null;
  /** Monthly price in ARS (whole pesos). */
  amountArs: number;
  reason: string;
  backUrl: string;
  trialDays: number;
}

export interface CheckoutResult {
  /** Provider-side subscription/preapproval id. */
  externalId: string;
  /** URL to redirect the user to in order to authorize payment. */
  initPoint: string;
}

export interface RemoteSubscription {
  externalId: string;
  /** Normalized status: active | pending | paused | canceled | unknown. */
  status: 'active' | 'pending' | 'paused' | 'canceled' | 'unknown';
  /** userId we stamped as external_reference, if the provider echoes it. */
  externalReference?: string;
  raw: unknown;
}

export interface BillingProvider {
  readonly name: string;
  createSubscription(params: CheckoutParams): Promise<CheckoutResult>;
  getSubscription(externalId: string): Promise<RemoteSubscription>;
  cancelSubscription(externalId: string): Promise<void>;
}
