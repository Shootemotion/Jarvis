import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AIProvider, AnthropicProvider, OllamaProvider, OpenAIProvider } from '@jarvis/providers';
import { AppConfigService } from '../config/config.service';

/**
 * Holds instantiated AI providers. Ollama (local) is always available; premium
 * cloud providers (Anthropic/OpenAI) register only when their API key is set,
 * server-side. Provider selection is gated per-user by entitlements (Pro).
 */
@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers = new Map<string, AIProvider>();
  private premiumName: string | null = null;
  /** Dedicated embedding provider — SEPARATE from chat (Groq can't embed). */
  private embeddingProvider: AIProvider | null = null;

  constructor(private readonly config: AppConfigService) {
    const ollama = new OllamaProvider({
      baseUrl: this.config.ollama.baseUrl,
      defaultModel: this.config.ollama.defaultModel,
      embeddingModel: this.config.env.EMBEDDING_MODEL,
      enabled: true,
    });
    this.providers.set(ollama.name, ollama);

    // ---- Generation (chat) ----
    // CHAT_* override wins; otherwise the legacy ANTHROPIC_*/OPENAI_* path.
    const chat = this.config.chat;
    if (chat.apiKey) {
      const name = chat.provider === 'anthropic' ? 'anthropic' : 'openai';
      this.providers.set(
        name,
        name === 'anthropic'
          ? new AnthropicProvider({ apiKey: chat.apiKey, defaultModel: chat.model })
          : new OpenAIProvider({ apiKey: chat.apiKey, baseUrl: chat.baseUrl, defaultModel: chat.model }),
      );
      this.premiumName = name;
      this.logger.log(`Chat provider: ${name} (${chat.baseUrl ?? 'default endpoint'}).`);
    } else {
      const anthropicKey = this.config.env.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        this.providers.set('anthropic', new AnthropicProvider({ apiKey: anthropicKey }));
        this.premiumName = 'anthropic';
      }
      const openaiKey = this.config.env.OPENAI_API_KEY;
      if (openaiKey) {
        this.providers.set(
          'openai',
          new OpenAIProvider({
            apiKey: openaiKey,
            baseUrl: this.config.env.OPENAI_BASE_URL,
            defaultModel: this.config.env.OPENAI_DEFAULT_MODEL,
          }),
        );
        if (!this.premiumName) this.premiumName = 'openai';
      }
      if (this.premiumName) this.logger.log(`Chat provider (legacy): ${this.premiumName}.`);
    }

    // ---- Embeddings (separate capability) ----
    const emb = this.config.embeddings;
    if (emb.provider === 'local') {
      this.embeddingProvider = ollama; // nomic-embed-text
    } else if (emb.apiKey) {
      this.embeddingProvider = new OpenAIProvider({
        apiKey: emb.apiKey,
        baseUrl: emb.baseUrl,
        embeddingModel: emb.model,
        embeddingDimensions: emb.dimensions,
      });
      this.logger.log(`Embedding provider: ${emb.provider} (${emb.model}, ${emb.dimensions}d).`);
    } else {
      this.embeddingProvider = null;
      this.logger.warn(
        'No embedding provider configured — set EMBEDDING_API_KEY (OpenAI) or EMBEDDING_PROVIDER=local. Semantic memory/knowledge disabled.',
      );
    }
  }

  getProvider(name: string): AIProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new NotFoundException(`Proveedor "${name}" no disponible.`);
    }
    return provider;
  }

  /** Is a managed (server-key) provider registered for this name? */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /** Build a provider instance on the fly with a BYO key (per-request). */
  buildProvider(name: string, apiKey: string, model?: string): AIProvider {
    if (name === 'anthropic') return new AnthropicProvider({ apiKey, defaultModel: model });
    if (name === 'openai') return new OpenAIProvider({ apiKey, defaultModel: model });
    throw new NotFoundException(`Proveedor "${name}" no soporta BYO.`);
  }

  /** Is a premium cloud provider configured? */
  hasPremium(): boolean {
    return this.premiumName !== null;
  }

  /**
   * Pick the provider for a request: the premium provider when the user is
   * allowed (Pro) and one is configured; otherwise the local Ollama model.
   */
  pickProvider(allowPremium: boolean): AIProvider {
    if (allowPremium && this.premiumName) return this.getProvider(this.premiumName);
    return this.getProvider('ollama');
  }

  /** Is a dedicated embedding provider configured? */
  hasEmbedding(): boolean {
    return !!this.embeddingProvider?.embed;
  }

  /** Name of the active generation (chat) provider (premium if set, else ollama). */
  get generationName(): string {
    return this.premiumName ?? 'ollama';
  }

  /** Generate an embedding via the dedicated embedding provider (never chat/Groq). */
  async embed(text: string): Promise<number[]> {
    const p = this.embeddingProvider;
    if (!p?.embed) {
      throw new Error(
        'Embeddings no configurados. Definí EMBEDDING_API_KEY (OpenAI) o EMBEDDING_PROVIDER=local.',
      );
    }
    return p.embed(text);
  }

  /** Embed several texts (sequential; fine for milestone-scale ingestion). */
  async embedMany(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const t of texts) out.push(await this.embed(t));
    return out;
  }
}
