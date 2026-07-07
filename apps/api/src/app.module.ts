import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { MeteringModule } from './metering/metering.module';
import { AiSettingsModule } from './ai-settings/ai-settings.module';
import { BillingModule } from './billing/billing.module';
import { ProvidersModule } from './providers/providers.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';
import { MemoryModule } from './memory/memory.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuthModule,
    CryptoModule,
    EntitlementsModule,
    MeteringModule,
    AiSettingsModule,
    BillingModule,
    ProvidersModule,
    HealthModule,
    ProjectsModule,
    MemoryModule,
    ChatModule,
  ],
})
export class AppModule {}
