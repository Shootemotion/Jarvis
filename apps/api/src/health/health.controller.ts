import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { Public } from '../auth/public.decorator';

// Single source of truth: repo-root version.json (cwd is apps/api at runtime).
const APP_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), '../../version.json'), 'utf8')).version;
  } catch {
    return 'dev';
  }
})();

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get()
  async check() {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      service: 'jarvis-api',
      env: this.config.env.APP_ENV,
      db,
      ollama: this.config.ollama,
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  }
}
