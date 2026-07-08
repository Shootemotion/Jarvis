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
   * Embeddings backend. 'local' → Ollama (nomic-embed-text). 'openai' →
   * text-embedding-3-small truncated to EMBEDDING_DIMENSIONS (cloud, no Ollama).
   */
  get embeddings() {
    const provider = this.env.EMBEDDING_PROVIDER === 'openai' ? 'openai' : 'local';
    const model =
      provider === 'openai' && !this.env.EMBEDDING_MODEL.startsWith('text-embedding')
        ? 'text-embedding-3-small'
        : this.env.EMBEDDING_MODEL;
    return { provider, model, dimensions: this.env.EMBEDDING_DIMENSIONS };
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
