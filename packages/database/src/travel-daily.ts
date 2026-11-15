import type { Database } from './client';
import { approveCleanAutoClaims, settleMissedDays } from './travel-auto-approve';
import { currentWorkforcePolicy } from './travel-snapshot';

/**
 * The morning travel job (Duty Day step 2), run after the night close: first any closed day
 * of the last 7 days that was saved without a claim is settled again, then each clean
 * automatic claim of an earlier day is approved as the system. Each step is safe to repeat.
 * A day that fails is logged and the rest go on; at the end the job fails with the first
 * error, so the run is kept as failed and the admin desk is told. Returns what it changed.
 */
export async function runTravelMorningJob(db: Database, today: string): Promise<number> {
  const policy = await currentWorkforcePolicy(db);
  const missed = await settleMissedDays(db, today, policy);
  const approvals = await approveCleanAutoClaims(db, today, policy);
  const failed = missed.failed + approvals.failed;
  if (failed > 0)
    throw new Error(`Travel claims: ${failed} could not be settled or approved.`, {
      cause: missed.firstError ?? approvals.firstError,
    });
  return missed.made + approvals.approved;
}
