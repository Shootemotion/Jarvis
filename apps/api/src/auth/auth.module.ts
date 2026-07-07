import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersService } from './users.service';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  providers: [UsersService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [UsersService],
})
export class AuthModule {}
