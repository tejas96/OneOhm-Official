import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { bankPayouts } from '@oneohm/database';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { applyPayoutEvent } from './payout-events';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway';

const EVERY_MINUTES = 5;

/**
 * Asks RazorpayX about every payout still on its way, on start and every few minutes,
 * so a bill is settled even when the payout webhook never arrives (PRD 3.11).
 */
@Injectable()
export class PayoutSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('RazorpayXCheck');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYOUT_GATEWAY) private readonly gateway: PayoutGateway,
  ) {}

  onApplicationBootstrap(): void {
    if (this.gateway.mode !== 'live') return;
    void this.run();
    this.timer = setInterval(() => void this.run(), EVERY_MINUTES * 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns how many payouts changed status. */
  async run(): Promise<{ updated: number }> {
    let updated = 0;
    try {
      const open = await this.db
        .select({ id: bankPayouts.providerPayoutId })
        .from(bankPayouts)
        .where(
          and(
            eq(bankPayouts.provider, 'razorpayx'),
            isNotNull(bankPayouts.providerPayoutId),
            inArray(bankPayouts.status, ['queued', 'pending', 'processing']),
          ),
        );
      for (const payout of open) {
        if (!payout.id) continue;
        const entity = await this.gateway.fetchPayout(payout.id);
        if (!entity) continue;
        const outcome = await applyPayoutEvent(this.db, { payload: { payout: { entity } } });
        if (
          !['repeat', 'ignored', 'unknown_payout', 'processing', 'queued', 'pending'].includes(
            outcome,
          )
        )
          updated += 1;
      }
      if (updated) this.logger.log(`Updated ${updated} payouts.`);
    } catch (error) {
      this.logger.error(
        `RazorpayX check failed: ${error instanceof Error ? error.message : error}`,
      );
    }
    return { updated };
  }
}
