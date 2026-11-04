import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { SalesChecksService } from './sales-checks.service';

/**
 * "Run now" for the sales checks, for the owner and for the acceptance suite. A pretend
 * time (`now`) is read only on a test server (test mode, or WhatsApp in log mode).
 */
@Controller('v1/sales-checks')
export class SalesChecksController {
  constructor(
    private readonly checks: SalesChecksService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  @Post('run')
  @HttpCode(200)
  run(@CurrentActor() actor: Actor, @Body() body: { now?: string } | undefined) {
    assertCan(actor, 'settings.manage');
    const pretend = body?.now ? new Date(body.now) : null;
    const usable =
      pretend &&
      !Number.isNaN(pretend.getTime()) &&
      (this.env.NODE_ENV === 'test' || this.env.WHATSAPP_DELIVERY === 'log');
    return this.checks.run(usable ? pretend : new Date());
  }
}
