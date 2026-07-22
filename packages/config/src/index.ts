import { z } from 'zod';

/**
 * Operating modes for the whole assistant.
 * Hybrid is the main target mode.
 */
export type JarvisMode = 'free' | 'paid' | 'hybrid';

/**
 * Environment schema. Anything sensitive stays as a raw value here
 * (loaded from process.env) and is never persisted to the database.
 */
const envSchema = z.object({
  APP_ENV: z.string().default('local'),
  // 'selfhost' = local single-user (no login). 'cloud' = hosted SaaS (auth required).
  DEPLOYMENT_MODE: z.enum(['selfhost', 'cloud']).default('selfhost'),
  API_PORT: z.coerce.number().default(4010),
  WEB_PORT: z.coerce.number().default(3000),
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:4010'),
  // Comma-separated list of allowed browser origins for CORS (production).
  // Falls back to localhost + PUBLIC_WEB_URL when unset.
  CORS_ORIGINS: z.string().optional(),

  JARVIS_USER_NAME: z.string().default('Bruno'),
  JARVIS_USER_EMAIL: z.string().email().default('bruno.cleri@diagnos.com.ar'),

  DATABASE_URL: z
    .string()
    .default('postgresql://jarvis:jarvis@localhost:5432/jarvis?schema=public'),

  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_DEFAULT_MODEL: z.string().default('qwen2.5:3b'),

  // --- Capability-separated providers (see docs/PROVIDER_ORCHESTRATION.md) ---
  // Chat / generation. Falls back to OPENAI_*/ANTHROPIC_*/OLLAMA_* when unset.
  CHAT_PROVIDER: z.string().optional(), // openai | anthropic | groq | ollama
  CHAT_BASE_URL: z.string().optional(),
  CHAT_API_KEY: z.string().optional(),
  CHAT_MODEL: z.string().optional(),

  // Embeddings — SEPARATE from chat (Groq has no /embeddings endpoint).
  EMBEDDING_PROVIDER: z.string().default('local'), // local(ollama) | openai | compat
  EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(768),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().optional(),

  // Supabase (cloud mode auth). SUPABASE_JWT_SECRET verifies access tokens server-side.
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  // Secret for encrypting per-user BYO API keys at rest (hex/base64, 32 bytes).
  JARVIS_ENCRYPTION_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  // OpenAI-compatible endpoints (Groq, OpenRouter, Together, local, …). Point
  // OPENAI_BASE_URL at the provider and set OPENAI_DEFAULT_MODEL to test for free.
  // e.g. Groq: https://api.groq.com/openai/v1 + llama-3.3-70b-versatile
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().optional(),
  // When true, everyone (incl. Free) uses the managed premium LLM instead of
  // Ollama. Useful in cloud where Ollama doesn't exist. Cost is bounded by quotas.
  MANAGED_LLM_FOR_ALL: z.coerce.boolean().default(false),
  // Autonomous memory: JARVIS extracts + reconciles durable memories from each
  // conversation, unattended. Needs an embedding provider.
  AUTO_MEMORY_ENABLED: z.coerce.boolean().default(true),
  GEMINI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),

  OBSIDIAN_ENABLED: z.coerce.boolean().default(true),
  OBSIDIAN_VAULT_PATH: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  N8N_BASE_URL: z.string().default('http://localhost:5678'),
  N8N_API_KEY: z.string().optional(),

  // Mercado Pago billing (cloud mode). Without MP_ACCESS_TOKEN the app runs in
  // a dev "mock checkout" mode that activates Pro locally for testing.
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  // Public URL of the web app, used to build Mercado Pago back/return URLs.
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  // Pro plan billing (ARS). Overridable without touching plan defs.
  PRO_PRICE_ARS: z.coerce.number().default(4999),
  PRO_TRIAL_DAYS: z.coerce.number().default(0),

  REQUIRE_CONFIRMATION_FOR_SENSITIVE_ACTIONS: z.coerce.boolean().default(true),

  DAILY_API_BUDGET_USD: z.coerce.number().default(2),
  MONTHLY_API_BUDGET_USD: z.coerce.number().default(30),
  BUDGET_WARNING_PERCENT: z.coerce.number().default(70),
});

export type JarvisEnv = z.infer<typeof envSchema>;

/**
 * Parse and validate the environment. Throws a readable error if invalid.
 */
export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): JarvisEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid JARVIS environment:\n${issues}`);
  }
  return parsed.data;
}

/**
 * Default runtime configuration (spec §23). Only Ollama is enabled by default.
 */
export const defaultConfig = {
  mode: 'hybrid' as JarvisMode,
  mainProvider: 'ollama',
  cheapProvider: 'ollama',
  fallbackProvider: null as string | null,
  embeddingProvider: 'local',
  obsidianEnabled: true,
  n8nEnabled: true,
  telegramEnabled: false,
  requireConfirmationForSensitiveActions: true,
  dailyApiBudgetUsd: 2,
  monthlyApiBudgetUsd: 30,
};

/**
 * Default seed data (spec §24).
 */
export const defaultProjects = ['JARVIS', 'General'] as const;

export const defaultProviders = [
  { name: 'ollama', type: 'llm', enabled: true },
  { name: 'openai', type: 'llm', enabled: false },
  { name: 'anthropic', type: 'llm', enabled: false },
  { name: 'gemini', type: 'llm', enabled: false },
  { name: 'mistral', type: 'llm', enabled: false },
  { name: 'local_embeddings', type: 'embedding', enabled: true },
] as const;
