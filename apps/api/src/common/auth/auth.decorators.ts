import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { unauthenticated } from '../http/errors';
import type { Actor } from './actor';

export const PUBLIC_ROUTE = 'oneohm:public-route';

/** Reachable without a session (sign-in and health checks only). */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/** The verified actor for this request. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const request = context.switchToHttp().getRequest<Request & { actor?: Actor }>();
    if (!request.actor) throw unauthenticated();
    return request.actor;
  },
);
