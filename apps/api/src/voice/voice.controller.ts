import { Body, Controller, ForbiddenException, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { AppConfigService } from '../config/config.service';
import { FEATURES } from '../entitlements/plans';
import { OPENAI_VOICES, VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly entitlements: EntitlementsService,
    private readonly config: AppConfigService,
  ) {}

  private async allowed(userId: string): Promise<boolean> {
    const e = await this.entitlements.getForUser(userId);
    return e.features.includes(FEATURES.NEURAL_VOICE) || this.config.managedLlmForAll;
  }

  /** Whether premium voice is usable for this user + the available voices. */
  @Get('config')
  async config_(@CurrentUser() user: AuthUser) {
    const available = this.voice.available() && (await this.allowed(user.id));
    return { available, voices: OPENAI_VOICES, voice: this.config.tts.voice };
  }

  /** Synthesize speech (MP3). Gated to Pro / managed. */
  @Post('tts')
  async tts(
    @CurrentUser() user: AuthUser,
    @Body() body: { text: string; voice?: string },
    @Res() res: Response,
  ) {
    if (!(await this.allowed(user.id))) {
      throw new ForbiddenException('La voz neuronal es una función Pro.');
    }
    const audio = await this.voice.synthesize(body?.text ?? '', body?.voice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  }
}
