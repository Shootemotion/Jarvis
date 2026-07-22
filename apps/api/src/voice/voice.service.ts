import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

export const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

/** Premium neural TTS via OpenAI's /audio/speech. Returns MP3 bytes. */
@Injectable()
export class VoiceService {
  constructor(private readonly config: AppConfigService) {}

  available(): boolean {
    return this.config.hasTts;
  }

  async synthesize(text: string, voice?: string): Promise<Buffer> {
    const { apiKey, model, voice: defaultVoice } = this.config.tts;
    if (!apiKey) throw new ServiceUnavailableException('Voz premium no configurada (falta TTS_API_KEY).');
    const chosen = voice && OPENAI_VOICES.includes(voice) ? voice : defaultVoice;

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: text.slice(0, 4000),
        voice: chosen,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`TTS ${res.status}: ${t || res.statusText}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
