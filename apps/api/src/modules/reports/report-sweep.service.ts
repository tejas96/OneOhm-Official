import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { projects } from '@oneohm/database';
import { ne } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { ReportArchiveService } from './report-archive.service';

const EVERY_MINUTES = 10;

/**
 * Report data changes in many places besides tasks: DISCOM change requests, the store and
 * purchasing, the company profile. So every few minutes (and on start) each project's
 * reports are checked; only a report whose printed data changed is made again, and a
 * submitted one never is (PRD 3.18).
 */
@Injectable()
export class ReportSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Reports');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly archive: ReportArchiveService,
  ) {}

  onApplicationBootstrap(): void {
    // A short pause so a restart is not slowed by printing.
    setTimeout(() => void this.sweep(), 30_000).unref();
    this.timer = setInterval(() => void this.sweep(), EVERY_MINUTES * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let saved = 0;
    try {
      const rows = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(ne(projects.status, 'cancelled'));
      for (const row of rows) {
        try {
          saved += (await this.archive.refresh(row.id, null, 'auto')).saved;
        } catch (error) {
          this.log.error(`Report check for ${row.id} failed: ${String(error)}`);
        }
      }
      if (saved > 0) this.log.log(`Saved ${saved} reports whose data changed.`);
    } finally {
      this.running = false;
    }
  }
}
