import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { ChatService } from './chat.service';
import { ChatDto } from './dto';

@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('chat')
  send(@CurrentUser() user: AuthUser, @Body() dto: ChatDto) {
    return this.chat.chat(user.id, dto);
  }

  @Get('conversations')
  listConversations(
    @CurrentUser() user: AuthUser,
    @Query('projectId') projectId?: string,
  ) {
    return this.chat.listConversations(user.id, projectId);
  }

  @Get('conversations/:id')
  getConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.getConversation(user.id, id);
  }
}
