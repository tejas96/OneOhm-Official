import type { DatabaseExecutor } from '@oneohm/database';
import { AD_PROVIDERS, type AdProvider } from '@oneohm/domain';
import {
  type AdPlatform,
  adPlatform,
  type MarketingConfig,
  PlatformError,
  saveConnection,
} from '@oneohm/marketing';
import { lastWorked, markPlatformRun, readJob } from './job-store';
import { type Cadence, isDue } from './pacing';

/** The connection needs the owner: its login stopped working. */
export async function markNeedsAttention(
  db: DatabaseExecutor,
  config: MarketingConfig,
  provider: AdProvider,
  words: string,
): Promise<void> {
  await saveConnection(db, config.secretKey, provider, {
    status: 'needs_attention',
    lastError: words,
  });
}

/** How a job keeps its pace per platform, so a failing one does not hold the healthy one back. */
export interface PlatformPace {
  /** The job's key; each platform's own run is kept under `<key>:<provider>`. */
  readonly key: string;
  readonly cadence: Cadence;
  readonly timeZone: string;
  readonly now: Date;
}

/** Refusals that waiting will not fix: the platform is tried again at the job's normal pace. */
const WAITING_WONT_FIX = new Set(['permission', 'not_available', 'invalid']);

/** Whether this platform's turn is due: never run, or its own pace has come round. */
async function turnIsDue(
  db: DatabaseExecutor,
  pace: PlatformPace | undefined,
  provider: AdProvider,
): Promise<boolean> {
  if (!pace) return true;
  const last = lastWorked(await readJob(db, `${pace.key}:${provider}`));
  return isDue(pace.cadence, last, pace.now, pace.timeZone);
}

/** A failed turn: noted when it is the platform's own business; the error to throw otherwise. */
async function handleFailure(
  db: DatabaseExecutor,
  config: MarketingConfig,
  provider: AdProvider,
  error: unknown,
  pace: PlatformPace | undefined,
): Promise<unknown> {
  const kind = error instanceof PlatformError ? error.kind : null;
  if (kind === 'auth') {
    await markNeedsAttention(db, config, provider, (error as PlatformError).message);
    return null;
  }
  if (pace && kind && WAITING_WONT_FIX.has(kind)) {
    await markPlatformRun(
      db,
      `${pace.key}:${provider}`,
      (error as Error).message.slice(0, 500),
      pace.now,
    );
    return null;
  }
  return error;
}

/**
 * Runs the work for each connected platform. A platform that is not connected is left out; a
 * login that stopped working marks its connection as needing attention; a refusal that waiting
 * will not fix is noted as that platform's run (so it backs off to the normal pace); any other
 * failure is thrown after the other platform had its turn. With `pace`, each platform keeps its
 * own last run, so one that keeps failing never makes the healthy one run every tick. Null when
 * no platform is connected.
 */
export async function forEachPlatform(
  db: DatabaseExecutor,
  config: MarketingConfig,
  work: (platform: AdPlatform, provider: AdProvider) => Promise<number>,
  pace?: PlatformPace,
): Promise<number | null> {
  let done = 0;
  let connected = 0;
  let failure: unknown = null;
  for (const provider of AD_PROVIDERS) {
    const platform = await adPlatform(db, config, provider);
    if (!platform) continue;
    connected += 1;
    if (!(await turnIsDue(db, pace, provider))) continue;
    try {
      done += await work(platform, provider);
      if (pace) await markPlatformRun(db, `${pace.key}:${provider}`, null, pace.now);
    } catch (error) {
      failure ??= await handleFailure(db, config, provider, error, pace);
    }
  }
  if (failure) throw failure;
  return connected === 0 ? null : done;
}
