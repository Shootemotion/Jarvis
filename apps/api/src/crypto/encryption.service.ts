import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AppConfigService } from '../config/config.service';

/**
 * AES-256-GCM encryption for per-user secrets (BYO API keys) at rest.
 * The DB only ever stores ciphertext; plaintext lives in memory transiently.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    const raw = config.env.JARVIS_ENCRYPTION_KEY;
    if (raw) {
      // Accept hex or base64; normalize to 32 bytes via SHA-256.
      this.key = createHash('sha256').update(raw).digest();
    } else {
      this.logger.warn(
        'JARVIS_ENCRYPTION_KEY no configurada — usando clave de desarrollo (NO usar en producción).',
      );
      this.key = createHash('sha256').update('jarvis-dev-insecure-key').digest();
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64');
  }

  decrypt(enc: string): string {
    const buf = Buffer.from(enc, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}
