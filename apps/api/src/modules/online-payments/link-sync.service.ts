import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { noteBackgroundRun, paymentLinks } from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';
import { GatewayPaymentsService } from './gateway-payments.service';

const EVERY_MINUTES = 5;

/**
 * Asks Razorpay about every open payment link, on start and every few minutes, so a
 * payment is recorded even when its webhook never arrives (PRD 3.11). Recording is
 * idempotent: a payment the webhook already recorded is skipped.
 */
@Injectable()
export class LinkSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('RazorpayCheck');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly payments: GatewayPaymentsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.gateway.mode !== 'live') return;
    void this.run();
    this.timer = setInterval(() => void this.run(), EVERY_MINUTES * 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns how many payments were newly recorded and links closed. */
  async run(): Promise<{ recorded: number; closed: number }> {
    let recorded = 0;
    let closed = 0;
    try {
      const open = await this.db
        .select({ id: paymentLinks.providerLinkId })
        .from(paymentLinks)
        .where(
          and(
            eq(paymentLinks.provider, 'razorpay'),
            inArray(paymentLinks.status, ['created', 'partly_paid']),
          ),
        );
      for (const link of open) {
        const checked = await this.gateway.check(link.id);
        if (!checked) continue;
        for (const payment of checked.payments) {
          const outcome = await this.payments.recordLinkPayment(payment);
          if (outcome.startsWith('recorded')) recorded += 1;
        }
        if (checked.status === 'expired' || checked.status === 'cancelled') {
          await this.payments.markLink(link.id, checked.status);
          closed += 1;
        }
      }
      if (recorded || closed)
        this.logger.log(`Recorded ${recorded} payments, closed ${closed} links.`);
      await noteBackgroundRun(this.db, 'payment_link_sync', { count: recorded + closed });
    } catch (error) {
      this.logger.error(`Razorpay check failed: ${error instanceof Error ? error.message : error}`);
      await noteBackgroundRun(this.db, 'payment_link_sync', { error });
    }
    return { recorded, closed };
  }
}
