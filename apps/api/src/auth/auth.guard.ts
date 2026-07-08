import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import { AppConfigService } from '../config/config.service';
import { UsersService } from './users.service';
import { ApiTokensService } from './api-tokens.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * selfhost mode → attaches the single seeded user (no login).
 * cloud mode → requires a valid Supabase access token (JWT), provisions the
 * user, and attaches it to the request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  private jwks?: JWTVerifyGetKey;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
    private readonly users: UsersService,
    private readonly apiTokens: ApiTokensService,
  ) {}

  /** Supabase's public signing keys (new asymmetric JWT signing keys). */
  private getJwks(): JWTVerifyGetKey {
    if (!this.jwks) {
      const url = this.config.supabaseUrl;
      if (!url) throw new Error('SUPABASE_URL no configurada');
      this.jwks = createRemoteJWKSet(
        new URL(`${url}/auth/v1/.well-known/jwks.json`),
      );
    }
    return this.jwks;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    if (!this.config.isCloud) {
      req.user = await this.users.getSelfHostUser();
      return true;
    }

    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de autenticación.');
    }
    const bearer = header.slice(7);

    // JARVIS personal API token (e.g. Obsidian sync plugin).
    if (ApiTokensService.looksLikeApiToken(bearer)) {
      const user = await this.apiTokens.resolve(bearer);
      if (!user) throw new UnauthorizedException('Token de API inválido.');
      req.user = user;
      return true;
    }

    try {
      const { payload } = await jwtVerify(header.slice(7), this.getJwks());
      const sub = payload.sub as string;
      const email = (payload.email as string) ?? null;
      if (!sub) throw new Error('sin sub');
      req.user = await this.users.provisionFromAuth(sub, email);
      return true;
    } catch (err) {
      this.logger.warn(`JWT inválido: ${String(err)}`);
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }
}
