import type { Database } from '@oneohm/database';
import { errorDetail } from '@oneohm/marketing';
import { lastWorked, markJobRun, readJob } from './job-store';
import { type Cadence, isDue } from './pacing';

/**
 * One marketing job at its pace. A job gives back how many things it did, or null when it had
 * nothing to do (not connected, switched off): that is not recorded as a run. A failure is
 * recorded with its words and thrown again, so Temporal retries and the next tick tries again.
 */
export function paced(
  db: Database,
  timeZone: string,
  key: string,
  cadence: Cadence,
  run: (now: Date) => Promise<number | null>,
): () => Promise<number> {
  return async () => {
    const now = new Date();
    if (cadence !== 'every' && !isDue(cadence, lastWorked(await readJob(db, key)), now, timeZone))
      return 0;
    try {
      const done = await run(now);
      if (done !== null) await markJobRun(db, key, null, now);
      return done ?? 0;
    } catch (error) {
      await markJobRun(db, key, errorDetail(error).slice(0, 500), now);
      throw error;
    }
  };
}
