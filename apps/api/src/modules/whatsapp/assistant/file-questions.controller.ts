import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { type Actor, assertCan } from '../../../common/auth/actor';
import { CurrentActor } from '../../../common/auth/auth.decorators';
import { ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { FileQuestionsService } from './file-questions';

/**
 * "Run now" for the "What is this?" questions, for the owner and for the acceptance suite. A
 * pretend time (`now`) is read only when the server is a test one (test mode, or WhatsApp in
 * log mode), so a live server always uses its clock.
 */
@Controller('v1/whatsapp/file-questions')
export class FileQuestionsController {
  constructor(
    private readonly questions: FileQuestionsService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  @Post('run')
  @HttpCode(200)
  async run(@CurrentActor() actor: Actor, @Body() body: { now?: string } | undefined) {
    assertCan(actor, 'settings.manage');
    const pretend = body?.now ? new Date(body.now) : null;
    const usable =
      pretend &&
      !Number.isNaN(pretend.getTime()) &&
      (this.env.NODE_ENV === 'test' || this.env.WHATSAPP_DELIVERY === 'log');
    return { asked: await this.questions.run(usable ? pretend : new Date()) };
  }
}
