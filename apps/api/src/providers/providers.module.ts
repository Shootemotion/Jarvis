import { Global, Module } from '@nestjs/common';
import { ProviderRegistryService } from './provider-registry.service';
import { ProvidersController } from './providers.controller';

@Global()
@Module({
  controllers: [ProvidersController],
  providers: [ProviderRegistryService],
  exports: [ProviderRegistryService],
})
export class ProvidersModule {}
