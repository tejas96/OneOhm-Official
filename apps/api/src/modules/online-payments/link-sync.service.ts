import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { noteBackgroundRun, paymentLinks } from '@oneohm/database';
import { and, eq, inArray, sql } from 'drizzle-orm';
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

  /**
   * Returns how many payments were newly recorded and links closed. One API copy runs it
   * at a time (an advisory lock held for the run); a link that fails is skipped, the
   * others go on, and the run is recorded as failed naming it.
   */
  async run(): Promise<{ recorded: number; closed: number }> {
    const done = { recorded: 0, closed: 0 };
    try {
      await this.db.transaction(async (tx) => {
        const lock = await tx.execute<{ got: boolean }>(
          sql`select pg_try_advisory_xact_lock(hashtext('oneohm:payment_link_sync')) as got`,
        );
        if (!lock.rows[0]?.got) return;
        const failed = await this.sweep(done);
        if (done.recorded || done.closed)
          this.logger.log(`Recorded ${done.recorded} payments, closed ${done.closed} links.`);
        await noteBackgroundRun(
          this.db,
          'payment_link_sync',
          failed.length
            ? { error: new Error(`Link check failed for ${failed.join(', ')}.`) }
            : { count: done.recorded + done.closed },
        );
      });
    } catch (error) {
      this.logger.error(`Razorpay check failed: ${error instanceof Error ? error.message : error}`);
      await noteBackgroundRun(this.db, 'payment_link_sync', { error });
    }
    return done;
  }

  /** Checks every open link; returns the ids of the ones that failed. */
  private async sweep(done: { recorded: number; closed: number }): Promise<string[]> {
    const failed: string[] = [];
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
      try {
        await this.check(link.id, done);
      } catch (error) {
        failed.push(link.id);
        this.logger.error(
          `Razorpay check failed for ${link.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    return failed;
  }

  /** Records the link's captured payments, then closes it if Razorpay has. */
  private async check(id: string, done: { recorded: number; closed: number }): Promise<void> {
    const checked = await this.gateway.check(id);
    if (!checked) return;
    for (const payment of checked.payments) {
      const outcome = await this.payments.recordLinkPayment(payment);
      if (outcome.startsWith('recorded')) done.recorded += 1;
    }
    const status = checked.status;
    if (status !== 'expired' && status !== 'cancelled' && status !== 'paid') return;
    if ((await this.payments.markLink(id, status)) !== 'no open link') done.closed += 1;
  }
}
