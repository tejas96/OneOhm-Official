import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { AssistantService } from './assistant/assistant.service';
import { conversationFor, logIncoming } from './chat-store';
import { DeliveriesService } from './deliveries.service';
import { readWebhook, verifyMetaSignature } from './whatsapp-events';

/**
 * Meta's WhatsApp webhook: customer messages go to the assistant, and delivery receipts
 * update the outbox. Signed with the app secret; a repeat delivery is ignored.
 */
@Public()
@Controller('v1/webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly log = new Logger('WhatsApp');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly assistant: AssistantService,
    private readonly deliveries: DeliveriesService,
  ) {}

  /** The one-time check Meta makes when the webhook is set up. */
  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    if (!this.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) throw new NotFoundException();
    if (mode !== 'subscribe' || token !== this.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || !challenge)
      throw new ForbiddenException();
    return challenge;
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ messages: number; receipts: number }> {
    const secret = this.env.WHATSAPP_APP_SECRET;
    if (!secret) throw new NotFoundException();
    if (!request.rawBody || !verifyMetaSignature(request.rawBody, signature, secret))
      throw new UnauthorizedException('Bad signature.');
    const { incoming, updates } = readWebhook(request.body);
    let handled = 0;
    for (const message of incoming) {
      const chat = await conversationFor(this.db, message);
      if (!(await logIncoming(this.db, chat.id, message))) continue;
      try {
        await this.assistant.handle(chat, message);
        handled += 1;
      } catch (error) {
        // One bad message must not stop the rest; Meta would only resend the whole post.
        this.log.error(`Assistant failed on ${message.waMessageId}: ${String(error)}`);
      }
    }
    return { messages: handled, receipts: await this.deliveries.applyUpdates(updates) };
  }
}
