import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersService } from './users.service';
import { ApiTokensService } from './api-tokens.service';
import { TokensController } from './tokens.controller';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  controllers: [TokensController],
  providers: [UsersService, ApiTokensService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [UsersService, ApiTokensService],
})
export class AuthModule {}
