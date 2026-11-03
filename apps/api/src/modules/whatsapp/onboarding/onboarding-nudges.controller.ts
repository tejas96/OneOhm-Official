import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { type Actor, assertCan } from '../../../common/auth/actor';
import { CurrentActor } from '../../../common/auth/auth.decorators';
import { ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { OnboardingNudgesService } from './onboarding-nudges.service';

/**
 * "Run now" for the onboarding follow-up, for the owner and for the acceptance suite. A
 * pretend time (`now`) is read only when the server is a test one (test mode, or WhatsApp in log mode), so a live server always uses its clock.
 */
@Controller('v1/whatsapp/onboarding-nudges')
export class OnboardingNudgesController {
  constructor(
    private readonly nudges: OnboardingNudgesService,
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
    return this.nudges.run(usable ? pretend : new Date());
  }
}
