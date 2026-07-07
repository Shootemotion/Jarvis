import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { MeController } from './me.controller';

@Global()
@Module({
  controllers: [MeController],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
