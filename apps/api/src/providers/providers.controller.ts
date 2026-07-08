import { Controller, Get } from '@nestjs/common';
import { ProviderRegistryService } from './provider-registry.service';
import { AppConfigService } from '../config/config.service';

/** Read-only view of which providers are active, by capability. */
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  info() {
    const emb = this.config.embeddings;
    return {
      chat: { name: this.registry.generationName },
      embedding: {
        configured: this.registry.hasEmbedding(),
        provider: emb.provider,
        model: emb.model,
        dimensions: emb.dimensions,
      },
      managedForAll: this.config.managedLlmForAll,
    };
  }
}
