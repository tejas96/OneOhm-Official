import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { gatewayEvents } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { applyPayoutEvent } from '../bank-payouts/payout-events';
import { GatewayPaymentsService } from './gateway-payments.service';
import { readEvent, verifySignature } from './razorpay-events';
import { flagRefund } from './refund-alerts';

/**
 * Razorpay calls this when a link is paid, expires or is cancelled, when money is paid
 * out to the bank, and on a refund or dispute (finance is told). Each event is handled
 * once; anything else is acknowledged.
 */
@Public()
@Controller('v1/webhooks/razorpay')
export class RazorpayWebhookController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly payments: GatewayPaymentsService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ): Promise<{ outcome: string }> {
    // RazorpayX webhooks may be signed with their own secret.
    const secrets = [this.env.RAZORPAY_WEBHOOK_SECRET, this.env.RAZORPAYX_WEBHOOK_SECRET].filter(
      (value): value is string => Boolean(value),
    );
    if (secrets.length === 0) throw new NotFoundException();
    const raw = request.rawBody;
    if (!raw || !secrets.some((secret) => verifySignature(raw, signature, secret)))
      throw new UnauthorizedException('Bad signature.');
    const body = request.body as { event?: string };
    const [stored] = await this.db
      .insert(gatewayEvents)
      .values({
        provider: 'razorpay',
        eventId: eventId ?? `${body.event}:${raw.length}:${signature}`,
        event: body.event ?? 'unknown',
        payload: body,
      })
      .onConflictDoNothing()
      .returning({ id: gatewayEvents.id });
    if (!stored) return { outcome: 'repeat' };
    let outcome: string;
    try {
      outcome = await this.handle(body);
    } catch (error) {
      // Forget the event so Razorpay's retry is processed, not skipped as a repeat.
      await this.db.delete(gatewayEvents).where(eq(gatewayEvents.id, stored.id));
      throw error;
    }
    await this.db.update(gatewayEvents).set({ outcome }).where(eq(gatewayEvents.id, stored.id));
    return { outcome };
  }

  private async handle(body: unknown): Promise<string> {
    // Bank transfers to vendors and crews (RazorpayX).
    if ((body as { event?: string }).event?.startsWith('payout.'))
      return applyPayoutEvent(this.db, body);
    const news = readEvent(body);
    if (news.kind === 'paid') return this.payments.recordLinkPayment(news.payment);
    if (news.kind === 'closed') return this.payments.markLink(news.providerLinkId, news.status);
    if (news.kind === 'payout') return this.payments.recordPayout(news.payout);
    if (news.kind === 'refund') return flagRefund(this.db, news.refund);
    return 'ignored';
  }
}
