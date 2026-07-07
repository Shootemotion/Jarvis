import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { EncryptionService } from '../crypto/encryption.service';
import { UpdateAiSettingsDto } from './dto';

export interface ResolvedAiSettings {
  preferredProvider: string;
  model?: string;
  anthropicKey?: string;
  openaiKey?: string;
}

@Injectable()
export class AiSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly enc: EncryptionService,
  ) {}

  /** Client-safe view: preferences + which keys exist (never the keys). */
  async getPublic(userId: string) {
    const row = await this.prisma.aiSetting.findUnique({ where: { userId } });
    return {
      preferredProvider: row?.preferredProvider ?? 'auto',
      model: row?.model ?? null,
      byo: { anthropic: !!row?.anthropicKeyEnc, openai: !!row?.openaiKeyEnc },
      managed: {
        anthropic: !!this.config.env.ANTHROPIC_API_KEY,
        openai: !!this.config.env.OPENAI_API_KEY,
      },
    };
  }

  /** Server-side: decrypted keys for building providers at request time. */
  async getResolved(userId: string): Promise<ResolvedAiSettings> {
    const row = await this.prisma.aiSetting.findUnique({ where: { userId } });
    return {
      preferredProvider: row?.preferredProvider ?? 'auto',
      model: row?.model ?? undefined,
      anthropicKey: row?.anthropicKeyEnc ? this.enc.decrypt(row.anthropicKeyEnc) : undefined,
      openaiKey: row?.openaiKeyEnc ? this.enc.decrypt(row.openaiKeyEnc) : undefined,
    };
  }

  async update(userId: string, dto: UpdateAiSettingsDto) {
    const enc = (v?: string) => (v ? this.enc.encrypt(v) : null);
    const setKey = (v: string | undefined) => (v === undefined ? undefined : enc(v));

    await this.prisma.aiSetting.upsert({
      where: { userId },
      update: {
        ...(dto.preferredProvider ? { preferredProvider: dto.preferredProvider } : {}),
        ...(dto.model !== undefined ? { model: dto.model || null } : {}),
        ...(dto.anthropicKey !== undefined ? { anthropicKeyEnc: setKey(dto.anthropicKey) } : {}),
        ...(dto.openaiKey !== undefined ? { openaiKeyEnc: setKey(dto.openaiKey) } : {}),
      },
      create: {
        userId,
        preferredProvider: dto.preferredProvider ?? 'auto',
        model: dto.model || null,
        anthropicKeyEnc: enc(dto.anthropicKey),
        openaiKeyEnc: enc(dto.openaiKey),
      },
    });
    return this.getPublic(userId);
  }
}
