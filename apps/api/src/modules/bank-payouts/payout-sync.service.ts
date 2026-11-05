import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { bankPayouts, noteBackgroundRun, notifyHolders } from '@oneohm/database';
import { payoutNeverReached } from '@oneohm/domain';
import { and, eq, gt, inArray, or } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { applyPayoutEvent } from './payout-events';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway';
import {
  alertIfStuck,
  closePracticeLeftover,
  markNotReached,
  refundLeftoverFees,
} from './payout-reconcile';
import { syncRunState } from './payout-setup';

const EVERY_MINUTES = 5;
const ALERT_AFTER_FAILED_RUNS = 3;
const QUIET = ['repeat', 'stale', 'ignored', 'unknown_payout', 'queued', 'pending', 'processing'];

/**
 * Asks RazorpayX about every payout still on its way, on start and every few minutes,
 * so a bill is settled even when the payout webhook never arrives (PRD 3.11). A payout we
 * never got an id for is looked up by our reference. Runs in practice mode too, where
 * RazorpayX answers nothing but stuck payouts are still flagged.
 */
@Injectable()
export class PayoutSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('RazorpayXCheck');
  private timer: ReturnType<typeof setInterval> | null = null;
  /**
   * Kept only so older callers still compile. The failed-run count and the last check time
   * are read from the saved run records (see `syncRunState`), never from memory.
   */
  readonly lastRunAt: Date | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYOUT_GATEWAY) private readonly gateway: PayoutGateway,
  ) {}

  onApplicationBootstrap(): void {
    if (this.gateway.mode === 'off') return;
    // Old failed or returned payouts must not keep a fee as a cost (RazorpayX gives it back).
    void refundLeftoverFees(this.db)
      .then((fixed) => fixed && this.logger.log(`Refunded the fee of ${fixed} old payouts.`))
      .catch((error: unknown) => this.logger.error(`Fee repair failed: ${error}`));
    void this.run();
    this.timer = setInterval(() => void this.run(), EVERY_MINUTES * 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns how many payouts changed status. */
  async run(): Promise<{ updated: number }> {
    let updated = 0;
    let firstError: unknown;
    try {
      const day = new Date(Date.now() - 86_400_000);
      // Open payouts, and ones we called "did not reach" in the last day, in case they did.
      const rows = await this.db
        .select()
        .from(bankPayouts)
        .where(
          or(
            inArray(bankPayouts.status, ['queued', 'pending', 'processing']),
            and(eq(bankPayouts.failureCode, 'not_reached'), gt(bankPayouts.updatedAt, day)),
          ),
        );
      for (const row of rows) {
        try {
          if (await this.checkOne(row)) updated += 1;
        } catch (error) {
          firstError ??= error;
          this.logger.error(`Payout ${row.id}: ${error instanceof Error ? error.message : error}`);
        }
      }
    } catch (error) {
      firstError ??= error;
    }
    if (firstError === undefined) {
      if (updated) this.logger.log(`Updated ${updated} payouts.`);
      await noteBackgroundRun(this.db, 'payout_sync', { count: updated });
    } else {
      this.logger.error(
        `RazorpayX check failed: ${firstError instanceof Error ? firstError.message : firstError}`,
      );
      await noteBackgroundRun(this.db, 'payout_sync', { error: firstError });
      await this.noteFailure(firstError);
    }
    return { updated };
  }

  /** Asks RazorpayX only about its own payouts; once live, practice ones left open are closed. */
  private async checkOne(row: typeof bankPayouts.$inferSelect): Promise<boolean> {
    if (row.provider === this.gateway.provider) return this.check(row);
    return this.gateway.mode === 'live' && closePracticeLeftover(this.db, row.id);
  }

  /** Looks at one payout. True when its status changed. */
  private async check(row: typeof bankPayouts.$inferSelect): Promise<boolean> {
    const now = new Date();
    const entity = row.providerPayoutId
      ? await this.gateway.fetchPayout(row.providerPayoutId)
      : await this.gateway.findPayoutByReference(row.id);
    await this.db.update(bankPayouts).set({ lastCheckedAt: now }).where(eq(bankPayouts.id, row.id));
    let changed = false;
    if (entity) {
      const outcome = await applyPayoutEvent(this.db, { payload: { payout: { entity } } });
      changed = !QUIET.includes(outcome);
    } else if (
      !row.providerPayoutId &&
      row.status === 'queued' &&
      payoutNeverReached(row.createdAt, now)
    ) {
      changed = await markNotReached(this.db, row.id);
    }
    const [fresh] = await this.db.select().from(bankPayouts).where(eq(bankPayouts.id, row.id));
    if (fresh) await alertIfStuck(this.db, fresh, now);
    return changed;
  }

  /** After three failed runs in a row, tell approvers once a day that we cannot reach RazorpayX. */
  private async noteFailure(error: unknown): Promise<void> {
    // The failed run was just saved, so the stored count already includes it.
    const { failedInARow } = await syncRunState(this.db, ALERT_AFTER_FAILED_RUNS);
    if (failedInARow < ALERT_AFTER_FAILED_RUNS) return;
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await notifyHolders(this.db, 'finance.approve_payments', {
        kind: 'payout_sync_failing',
        title: `OneOhm cannot reach RazorpayX: ${reason}`,
        body: 'Bank transfers may not update here until this is fixed. Payments already sent are safe. Check the RazorpayX keys and your internet link.',
        dedupeKey: `payout_sync_failing:${new Date().toISOString().slice(0, 10)}`,
      });
    } catch (alertError) {
      this.logger.error(`Could not raise the sync alert: ${alertError}`);
    }
  }
}
