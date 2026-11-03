import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { type Actor, assertCan } from '../../../common/auth/actor';
import { CurrentActor } from '../../../common/auth/auth.decorators';
import { OnboardingNudgesService } from './onboarding-nudges.service';

/**
 * "Run now" for the onboarding follow-up, for the owner and for the acceptance suite. A
 * pretend time (`now`) is read only outside production, so a real server always uses its clock.
 */
@Controller('v1/whatsapp/onboarding-nudges')
export class OnboardingNudgesController {
  constructor(private readonly nudges: OnboardingNudgesService) {}

  @Post('run')
  @HttpCode(200)
  run(@CurrentActor() actor: Actor, @Body() body: { now?: string } | undefined) {
    assertCan(actor, 'settings.manage');
    const pretend = body?.now ? new Date(body.now) : null;
    const usable =
      pretend && !Number.isNaN(pretend.getTime()) && process.env.NODE_ENV !== 'production';
    return this.nudges.run(usable ? pretend : new Date());
  }
}
