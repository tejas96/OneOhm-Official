import type { PayoutSetup } from '@oneohm/api-contracts';
import { bankPayouts, gatewayEvents, jobRuns } from '@oneohm/database';
import { isLowBalanceFailure, payoutStuck } from '@oneohm/domain';
import { desc, eq, inArray, isNotNull, like, max } from 'drizzle-orm';
import type { Database } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import type { PayoutGateway } from './payout-gateway';

type SetupEnv = Pick<
  Environment,
  | 'RAZORPAY_KEY_ID'
  | 'RAZORPAY_KEY_SECRET'
  | 'RAZORPAYX_ACCOUNT_NUMBER'
  | 'RAZORPAYX_WEBHOOK_SECRET'
  | 'RAZORPAY_WEBHOOK_SECRET'
>;

/** Which RazorpayX settings are present, as yes or no. Never the keys or numbers themselves. */
export function setupFlags(env: SetupEnv) {
  return {
    accountNumberSet: Boolean(env.RAZORPAYX_ACCOUNT_NUMBER),
    keysSet: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
    keysAreTest: String(env.RAZORPAY_KEY_ID ?? '').startsWith('rzp_test_'),
    webhookSecretSet: Boolean(env.RAZORPAYX_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET),
  };
}

const iso = (value: Date | null | undefined): string | null => value?.toISOString() ?? null;
const later = (...dates: (Date | null | undefined)[]): Date | null =>
  dates.reduce<Date | null>((best, date) => (date && (!best || date > best) ? date : best), null);

/**
 * What the saved `payout_sync` run records say: when the newest run finished, and how many
 * of the newest runs in a row failed. Read from the database, so it survives a restart.
 */
export async function syncRunState(
  db: Database,
  look = 20,
): Promise<{ lastRunAt: Date | null; failedInARow: number; lastError: string | null }> {
  const runs = await db
    .select({ status: jobRuns.status, at: jobRuns.finishedAt, error: jobRuns.error })
    .from(jobRuns)
    .where(eq(jobRuns.name, 'payout_sync'))
    .orderBy(desc(jobRuns.createdAt))
    .limit(look);
  const firstOk = runs.findIndex((run) => run.status !== 'failed');
  return {
    lastRunAt: runs[0]?.at ?? null,
    failedInARow: firstOk === -1 ? runs.length : firstOk,
    lastError: runs[0]?.status === 'failed' ? (runs[0].error ?? 'The last check failed.') : null,
  };
}

/**
 * The RazorpayX setup check (spec U15). The last check time is the newest of: the saved
 * `payout_sync` run record and the last time any payout was looked up. Nothing is kept in
 * memory, so it is right after a restart too.
 * The last error is the saved record's error when its newest run failed.
 */
export async function payoutSetupFor(
  db: Database,
  env: SetupEnv,
  gateway: PayoutGateway,
  /** Unused: the check time is read from the saved runs. Kept so the caller still compiles. */
  _ownLastRunAt: Date | null = null,
  now = new Date(),
): Promise<PayoutSetup> {
  const [hook] = await db
    .select({ at: max(gatewayEvents.receivedAt) })
    .from(gatewayEvents)
    .where(like(gatewayEvents.event, 'payout.%'));
  const run = await syncRunState(db, 1);
  const [looked] = await db.select({ at: max(bankPayouts.lastCheckedAt) }).from(bankPayouts);
  const open = await db
    .select({ mode: bankPayouts.mode, createdAt: bankPayouts.createdAt })
    .from(bankPayouts)
    .where(inArray(bankPayouts.status, ['queued', 'pending', 'processing']));
  const [good] = await db
    .select({ at: max(bankPayouts.updatedAt) })
    .from(bankPayouts)
    .where(eq(bankPayouts.status, 'processed'));
  const failed = await db
    .select({ code: bankPayouts.failureCode, at: bankPayouts.updatedAt })
    .from(bankPayouts)
    .where(isNotNull(bankPayouts.failureCode))
    .orderBy(desc(bankPayouts.updatedAt))
    .limit(200);
  const lowBalance = failed.find((row) => isLowBalanceFailure(row.code));
  return {
    mode: gateway.mode,
    ...setupFlags(env),
    lastWebhookAt: iso(hook?.at),
    lastCheckAt: iso(later(run.lastRunAt, looked?.at)),
    lastCheckError: run.lastError,
    openPayouts: open.length,
    stuckPayouts: open.filter((row) => payoutStuck(row.mode, row.createdAt, now)).length,
    lastLowBalanceAt: iso(lowBalance?.at),
    lastGoodPayoutAt: iso(good?.at),
  };
}
