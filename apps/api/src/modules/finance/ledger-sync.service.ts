import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { backfillLedger } from '@oneohm/database';
import { DATABASE, type Database } from '../../config/core.module';

/**
 * On start, posts any event that has no journal entry yet. Postings are idempotent, so
 * this only fills gaps: bills other modules wrote straight into `payables` and approved
 * there, or history from before the ledger existed.
 */
@Injectable()
export class LedgerSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Ledger');

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  onApplicationBootstrap(): void {
    backfillLedger(this.db)
      .then((result) =>
        this.logger.log(
          `Ledger checked: ${result.milestones} due milestones, ${result.payments} payments, ${result.payables} bills.`,
        ),
      )
      .catch((error: unknown) =>
        this.logger.error(`Ledger check failed: ${error instanceof Error ? error.message : error}`),
      );
  }
}
