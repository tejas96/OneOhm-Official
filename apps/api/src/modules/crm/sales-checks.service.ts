import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { handBackQuietChats } from '../whatsapp/chat-hand-back';
import { acceptedNoProject, expiringQuotes, missedPromisedCalls } from './sales-checks';

const EVERY_MINUTES = 15;

export interface SalesChecksRun {
  readonly expiring: number;
  readonly calls: number;
  readonly noProject: number;
  /** Chats a person left quiet for 4 working hours, given back to the assistant. */
  readonly handedBack: number;
}

/**
 * The sales steps that must not go quiet: a sent quote about to run out, a call the bot
 * promised and nobody logged, an accepted quote with no project after a working day.
 * Each is one alert, once. A WhatsApp chat a person left quiet for 4 working hours goes
 * back to the assistant, so the customer is answered again. Runs in the API every 15
 * minutes (the clock is a parameter, so tests choose the time); a check that fails is
 * logged and the others go on.
 */
@Injectable()
export class SalesChecksService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('SalesChecks');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.SALES_CHECKS_TIMER === false) return;
    this.timer = setInterval(() => void this.run(), EVERY_MINUTES * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** How many alerts each check raised this run. */
  async run(now: Date = new Date()): Promise<SalesChecksRun> {
    const done = { expiring: 0, calls: 0, noProject: 0, handedBack: 0 };
    if (this.running) return done;
    this.running = true;
    const zone = this.env.BUSINESS_TIMEZONE;
    try {
      done.expiring = await this.check('expiring quotes', () => expiringQuotes(this.db, now, zone));
      done.calls = await this.check('promised calls', () =>
        missedPromisedCalls(this.db, now, zone),
      );
      done.noProject = await this.check('accepted quotes', () =>
        acceptedNoProject(this.db, now, zone),
      );
      done.handedBack = await this.check('quiet chats', () =>
        handBackQuietChats(this.db, now, zone),
      );
    } finally {
      this.running = false;
    }
    return done;
  }

  private async check(name: string, work: () => Promise<number>): Promise<number> {
    try {
      return await work();
    } catch (error) {
      this.log.error(
        `Sales check (${name}) failed: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }
}
