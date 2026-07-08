import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from './auth-user';
import { ApiTokensService } from './api-tokens.service';

@Controller('tokens')
export class TokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  /** Create a personal token (plaintext returned once). */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body('name') name?: string) {
    return this.tokens.create(user.id, name ?? 'Obsidian');
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tokens.list(user.id);
  }

  @Delete(':id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tokens.revoke(user.id, id);
  }
}
