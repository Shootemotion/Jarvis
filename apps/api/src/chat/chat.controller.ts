import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  /** Streaming chat (Server-Sent Events): tokens as they arrive, then final meta. */
  @Post('chat/stream')
  async stream(@CurrentUser() user: AuthUser, @Body() dto: ChatDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();
    try {
      for await (const ev of this.chat.chatStream(user.id, dto)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error del servidor.';
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
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
