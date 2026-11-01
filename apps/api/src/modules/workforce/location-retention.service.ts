import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { attendanceDays } from '@oneohm/database';
import { addDays, todayIn } from '@oneohm/shared';
import { and, isNull, lt } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { loadPolicy } from './policy';

const EVERY_HOURS = 12;

/**
 * Deletes check-in and check-out coordinates older than the retention period
 * (PRD 4.3, privacy). Times stay; only where the person was is removed.
 */
@Injectable()
export class LocationRetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('LocationRetention');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  onApplicationBootstrap(): void {
    void this.purge();
    this.timer = setInterval(() => void this.purge(), EVERY_HOURS * 3_600_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async purge(): Promise<number> {
    try {
      const { attendance } = await loadPolicy(this.db);
      const before = addDays(todayIn(), -attendance.retentionDays);
      const cleared = await this.db
        .update(attendanceDays)
        .set({
          checkInLatitude: null,
          checkInLongitude: null,
          checkInAccuracyM: null,
          checkOutLatitude: null,
          checkOutLongitude: null,
          checkOutAccuracyM: null,
          locationClearedAt: new Date(),
        })
        .where(and(lt(attendanceDays.workDate, before), isNull(attendanceDays.locationClearedAt)))
        .returning({ id: attendanceDays.id });
      if (cleared.length) this.logger.log(`Cleared location on ${cleared.length} attendance days.`);
      return cleared.length;
    } catch (error) {
      this.logger.error(
        `Location clean-up failed: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }
}
