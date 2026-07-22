import { Injectable } from '@nestjs/common';
import { loadEnv, defaultConfig, type JarvisEnv } from '@jarvis/config';

/**
 * Wraps the validated environment (from @jarvis/config) as an injectable
 * Nest service so the rest of the app never touches process.env directly.
 */
@Injectable()
export class AppConfigService {
  readonly env: JarvisEnv = loadEnv();
  readonly defaults = defaultConfig;

  get apiPort(): number {
    return this.env.API_PORT;
  }

  get isCloud(): boolean {
    return this.env.DEPLOYMENT_MODE === 'cloud';
  }

  get supabaseUrl(): string | undefined {
    return this.env.SUPABASE_URL;
  }

  get supabaseJwtSecret(): string | undefined {
    return this.env.SUPABASE_JWT_SECRET;
  }

  get ollama() {
    return {
      baseUrl: this.env.OLLAMA_BASE_URL,
      defaultModel: this.env.OLLAMA_DEFAULT_MODEL,
    };
  }

  /**
   * Chat / generation provider override (CHAT_*). When apiKey is absent the
   * ProviderRegistry falls back to the legacy OPENAI / ANTHROPIC / Ollama path.
   */
  get chat() {
    return {
      provider: this.env.CHAT_PROVIDER,
      baseUrl: this.env.CHAT_BASE_URL,
      apiKey: this.env.CHAT_API_KEY,
      model: this.env.CHAT_MODEL,
    };
  }

  /** Configured chat model (CHAT_MODEL, else legacy OPENAI_DEFAULT_MODEL). */
  get chatModelResolved(): string | undefined {
    return this.env.CHAT_MODEL ?? this.env.OPENAI_DEFAULT_MODEL ?? undefined;
  }

  /**
   * Embeddings backend — SEPARATE from chat. 'local' → Ollama (nomic-embed-text).
   * Otherwise an OpenAI-compatible endpoint (EMBEDDING_API_KEY/BASE_URL/MODEL),
   * truncated to EMBEDDING_DIMENSIONS to match the pgvector column.
   */
  get embeddings() {
    const raw = this.env.EMBEDDING_PROVIDER || 'local';
    const provider = raw === 'local' ? 'local' : raw; // 'local' | 'openai' | compat
    const isRemote = provider !== 'local';
    const model =
      isRemote && !this.env.EMBEDDING_MODEL.startsWith('text-embedding')
        ? 'text-embedding-3-small'
        : this.env.EMBEDDING_MODEL;
    return {
      provider,
      model,
      dimensions: this.env.EMBEDDING_DIMENSIONS,
      apiKey: this.env.EMBEDDING_API_KEY,
      baseUrl: this.env.EMBEDDING_BASE_URL,
    };
  }

  get billing() {
    return {
      mpAccessToken: this.env.MP_ACCESS_TOKEN,
      mpWebhookSecret: this.env.MP_WEBHOOK_SECRET,
      webUrl: this.env.PUBLIC_WEB_URL.replace(/\/+$/, ''),
      proPriceArs: this.env.PRO_PRICE_ARS,
      proTrialDays: this.env.PRO_TRIAL_DAYS,
    };
  }

  /** True when a real Mercado Pago token is configured; otherwise dev/mock mode. */
  get billingLive(): boolean {
    return !!this.env.MP_ACCESS_TOKEN;
  }

  /** Give everyone the managed premium LLM (cloud, no Ollama). */
  get managedLlmForAll(): boolean {
    return this.env.MANAGED_LLM_FOR_ALL;
  }

  /** Autonomous memory extraction from conversations. */
  get autoMemoryEnabled(): boolean {
    return this.env.AUTO_MEMORY_ENABLED;
  }

  /** Premium neural voice (OpenAI TTS). Reuses the OpenAI embedding key by default. */
  get tts() {
    return {
      apiKey: this.env.TTS_API_KEY ?? this.env.EMBEDDING_API_KEY,
      model: this.env.TTS_MODEL,
      voice: this.env.TTS_VOICE,
    };
  }
  get hasTts(): boolean {
    return !!this.tts.apiKey;
  }

  /**
   * Allowed CORS origins. Explicit CORS_ORIGINS list wins; otherwise localhost
   * (dev) plus the configured public web URL.
   */
  get corsOrigins(): string[] {
    // Normalize: trim + drop trailing slashes so a value like
    // "https://app.vercel.app/" still matches the browser Origin (no slash).
    const norm = (s: string) => s.trim().replace(/\/+$/, '');
    if (this.env.CORS_ORIGINS) {
      return this.env.CORS_ORIGINS.split(',').map(norm).filter(Boolean);
    }
    const origins = ['http://localhost:3000'];
    if (this.env.PUBLIC_WEB_URL) origins.push(norm(this.env.PUBLIC_WEB_URL));
    return origins;
  }
}
