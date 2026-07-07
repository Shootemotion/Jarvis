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

  constructor(private readonly config: AppConfigService) {
    const ollama = new OllamaProvider({
      baseUrl: this.config.ollama.baseUrl,
      defaultModel: this.config.ollama.defaultModel,
      embeddingModel: this.config.env.EMBEDDING_MODEL,
      enabled: true,
    });
    this.providers.set(ollama.name, ollama);

    // Premium providers activate only when a key is present (Pro / cloud).
    const anthropicKey = this.config.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      this.providers.set('anthropic', new AnthropicProvider({ apiKey: anthropicKey }));
      this.premiumName = 'anthropic';
      this.logger.log('Anthropic provider enabled.');
    }
    const openaiKey = this.config.env.OPENAI_API_KEY;
    if (openaiKey) {
      const emb = this.config.embeddings;
      this.providers.set(
        'openai',
        new OpenAIProvider({
          apiKey: openaiKey,
          embeddingModel: emb.model,
          embeddingDimensions: emb.dimensions,
        }),
      );
      if (!this.premiumName) this.premiumName = 'openai';
      this.logger.log('OpenAI provider enabled.');
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

  /**
   * Generate an embedding. Uses OpenAI (cloud) when EMBEDDING_PROVIDER=openai and
   * the OpenAI key is configured; otherwise the local Ollama model.
   */
  async embed(text: string): Promise<number[]> {
    const preferOpenai =
      this.config.embeddings.provider === 'openai' && this.providers.has('openai');
    const provider = this.getProvider(preferOpenai ? 'openai' : 'ollama');
    if (!provider.embed) {
      throw new Error('El proveedor de embeddings no soporta embed().');
    }
    return provider.embed(text);
  }
}
