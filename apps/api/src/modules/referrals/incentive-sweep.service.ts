import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { noteBackgroundRun } from '@oneohm/database';
import { DATABASE, type Database } from '../../config/core.module';
import { evaluateCommissions } from '../commissions/commission-evaluation';
import { evaluateReferralRewards } from './referral-evaluation';

const EVERY_MINUTES = 5;

/**
 * Projects reach their qualifying events through other modules (payments, task
 * completion), so this checks every few minutes and on start, earning referral rewards
 * and reseller commission once each. Finance screens also check when they open.
 */
@Injectable()
export class IncentiveSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Incentives');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  onApplicationBootstrap(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), EVERY_MINUTES * 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    try {
      const rewards = await evaluateReferralRewards(this.db);
      const commissions = await evaluateCommissions(this.db);
      if (rewards || commissions) {
        this.logger.log(`Earned ${rewards} referral rewards and ${commissions} commissions.`);
      }
      await noteBackgroundRun(this.db, 'incentive_sweep', { count: rewards + commissions });
    } catch (error) {
      this.logger.error(
        `Incentive check failed: ${error instanceof Error ? error.message : error}`,
      );
      await noteBackgroundRun(this.db, 'incentive_sweep', { error });
    }
  }
}
