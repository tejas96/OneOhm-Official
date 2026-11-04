import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type OnModuleInit,
  Param,
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
import { assistantAnswers, markAssistantTap } from './assistant/handled-taps';
import { ensureChatOwner, tellChatTeam } from './chat-owner';
import { type Conversation, conversationFor, logIncoming } from './chat-store';
import { DeliveriesService } from './deliveries.service';
import { forgetIncoming, isLateTap, tellNotHandled } from './inbound-retry';
import { type Incoming, readWebhook, webhookAccess } from './whatsapp-events';

/**
 * Meta's WhatsApp webhook: customer messages go to the assistant, and delivery receipts
 * update the outbox. Signed with the app secret; until that is known, a secret key at the
 * end of the URL stands in (see `webhookAccess`). A repeat delivery is ignored. A message
 * that fails is forgotten and answered 500, so Meta sends it again; a late tap is ignored.
 */
@Public()
@Controller('v1/webhooks/whatsapp')
export class WhatsAppWebhookController implements OnModuleInit {
  private readonly log = new Logger('WhatsApp');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly assistant: AssistantService,
    private readonly deliveries: DeliveriesService,
  ) {}

  onModuleInit(): void {
    if (!this.env.WHATSAPP_APP_SECRET && this.env.WHATSAPP_WEBHOOK_PATH_KEY)
      this.log.warn(
        'WhatsApp webhook is open by secret link only. Add WHATSAPP_APP_SECRET to check Meta signatures.',
      );
  }

  /** The one-time check Meta makes when the webhook is set up. */
  @Get([':key', ''])
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

  @Post([':key', ''])
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Param('key') key: string | undefined,
  ): Promise<{ messages: number; receipts: number }> {
    const access = webhookAccess(
      { appSecret: this.env.WHATSAPP_APP_SECRET, pathKey: this.env.WHATSAPP_WEBHOOK_PATH_KEY },
      { key, rawBody: request.rawBody, signature },
    );
    if (access === 'not_found') throw new NotFoundException();
    if (access === 'bad_signature') throw new UnauthorizedException('Bad signature.');
    const { incoming, updates } = readWebhook(request.body);
    let handled = 0;
    let failed = 0;
    for (const message of incoming) {
      const chat = await ensureChatOwner(this.db, await conversationFor(this.db, message));
      if (!(await logIncoming(this.db, chat.id, message))) continue;
      if (assistantAnswers(chat, message)) await markAssistantTap(this.db, message.waMessageId);
      if (isLateTap(chat, message)) {
        this.log.log(`Ignored a late tap ${message.waMessageId}: the chat has newer messages.`);
        continue;
      }
      try {
        await this.handle(chat, message);
        handled += 1;
      } catch (error) {
        // One bad message must not stop the rest; Meta resends the post after the 500.
        failed += 1;
        this.log.error(`Assistant failed on ${message.waMessageId}: ${String(error)}`);
        await this.recover(chat, message);
      }
    }
    const receipts = await this.deliveries.applyUpdates(updates);
    if (failed > 0) throw new InternalServerErrorException(`${failed} message(s) not handled.`);
    return { messages: handled, receipts };
  }

  /** Alerts the chat's people, then forgets the message so Meta's retry is handled. */
  private async recover(chat: Conversation, message: Incoming) {
    const failure = (what: string) => (error: unknown) =>
      this.log.error(`Could not ${what} ${message.waMessageId}: ${String(error)}`);
    await tellNotHandled(this.db, chat, message).catch(failure('alert about'));
    await forgetIncoming(this.db, message.waMessageId).catch(failure('forget'));
  }

  private async handle(chat: Conversation, message: Incoming) {
    // A person has this chat, so the assistant stays quiet: tell them the customer wrote.
    // Menu and quote taps (and the words a bot step waits for) are the assistant's, and
    // alert nobody.
    if (chat.state === 'human' && !assistantAnswers(chat, message)) {
      await this.tellAnswerer(chat, message);
      await this.assistant.nightReply(chat);
    }
    await this.assistant.handle(chat, message);
  }

  private async tellAnswerer(chat: Conversation, message: Incoming) {
    const name = chat.profileName ?? chat.phone;
    await tellChatTeam(this.db, chat, {
      kind: 'whatsapp_message',
      title: `WhatsApp from ${name}`,
      body: message.text ? message.text.slice(0, 140) : 'Sent a file',
      key: `wa_in:${message.waMessageId}`,
    });
  }
}
