/** Feature flags a plan can unlock. Checked across the app for gating. */
export const FEATURES = {
  PREMIUM_LLM: 'premium_llm',
  NEURAL_VOICE: 'neural_voice',
  INTEGRATIONS: 'integrations',
  AGENTS: 'agents',
  AUTOMATIONS: 'automations',
  CLOUD_SYNC: 'cloud_sync',
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

export interface PlanLimits {
  messagesPerMonth: number; // -1 = unlimited
  memories: number;
  storageMb: number;
  voiceMinutesPerMonth: number;
}

export interface PlanDef {
  key: string;
  name: string;
  description: string;
  priceArs: number;
  features: string[];
  limits: PlanLimits;
}

/** Canonical plan definitions (seeded to DB, also the source of truth). */
export const PLAN_DEFS: PlanDef[] = [
  {
    key: 'free',
    name: 'Free',
    description: 'Local y sin costo. Ideal para probar y para self-host.',
    priceArs: 0,
    features: [],
    limits: { messagesPerMonth: 100, memories: 50, storageMb: 50, voiceMinutesPerMonth: 0 },
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'Proveedores premium, voz neuronal, integraciones, agentes y nube.',
    priceArs: 4999, // placeholder — se define en Milestone 4 (Mercado Pago)
    features: Object.values(FEATURES),
    limits: { messagesPerMonth: 5000, memories: 5000, storageMb: 5000, voiceMinutesPerMonth: 300 },
  },
];

export const FREE_PLAN = PLAN_DEFS[0];
