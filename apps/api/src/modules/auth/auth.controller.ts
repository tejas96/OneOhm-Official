import { Controller, Inject, Res } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Response } from 'express';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, Public } from '../../common/auth/auth.decorators';
import { clearSessionCookies, setSessionCookies } from '../../common/auth/session-cookies';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { apiContract } from '../../contract';
import { AuthService } from './auth.service';

const { signIn, signOut, requestOtp, verifyOtp, me } = apiContract.auth;

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  private get secureCookies(): boolean {
    return this.env.COOKIE_SECURE ?? this.env.NODE_ENV === 'production';
  }

  @Public()
  @TsRestHandler(signIn)
  signIn(@Res({ passthrough: true }) response: Response) {
    return tsRestHandler(signIn, async ({ body }) => {
      const session = await this.auth.signInWithPassword(body.identifier, body.password);
      setSessionCookies(response, session.token, session.expiresAt, this.secureCookies);
      return { status: 200, body: { user: session.user } };
    });
  }

  @Public()
  @TsRestHandler(requestOtp)
  requestOtp() {
    return tsRestHandler(requestOtp, async ({ body }) => ({
      status: 202,
      body: await this.auth.requestOtp(body.phone),
    }));
  }

  @Public()
  @TsRestHandler(verifyOtp)
  verifyOtp() {
    return tsRestHandler(verifyOtp, async ({ body }) => {
      const session = await this.auth.verifyOtp(body.phone, body.code);
      return { status: 200, body: { token: session.token, user: session.user } };
    });
  }

  @TsRestHandler(signOut)
  signOut(@CurrentActor() actor: Actor, @Res({ passthrough: true }) response: Response) {
    return tsRestHandler(signOut, async () => {
      await this.auth.signOut(actor.sessionId);
      clearSessionCookies(response, this.secureCookies);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(me)
  me(@CurrentActor() actor: Actor) {
    return tsRestHandler(me, async () => ({ status: 200, body: actor.user }));
  }
}
