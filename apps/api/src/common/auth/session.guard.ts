import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import { forbidden, unauthenticated } from '../http/errors';
import type { Actor } from './actor';
import { PUBLIC_ROUTE } from './auth.decorators';
import { bearerToken, cookieValue, csrfTokenMatches, SESSION_COOKIE } from './session-cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: resolves the session from a bearer token (mobile) or the session cookie
 * (web), rejects anonymous access to non-public routes, and enforces CSRF for
 * cookie-authenticated unsafe requests.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const bearer = bearerToken(request);
    const token = bearer ?? cookieValue(request, SESSION_COOKIE);
    if (token) {
      const actor = await this.auth.authenticate(token, bearer ? 'bearer' : 'cookie');
      if (actor) request.actor = actor;
    }
    if (isPublic) return true;
    if (!request.actor) throw unauthenticated();
    if (
      request.actor.via === 'cookie' &&
      !SAFE_METHODS.has(request.method) &&
      !csrfTokenMatches(request)
    ) {
      throw forbidden('Security check failed. Refresh the page and try again.');
    }
    return true;
  }
}
