import { runTravelMorningJob } from '@oneohm/database';
import { acceptanceDb } from '../../acceptance/support/db';
import type { Session } from '../../acceptance/support/http';
import { indiaDate } from '../../acceptance/support/travel';

/**
 * The morning job as it runs the day after (earlier days' claims are due), with automatic
 * approval switched on in Settings for the run and the saved settings put back afterwards.
 * Only the acceptance database is touched (`acceptanceDb` refuses any other).
 */
export async function approveRun(admin: Session): Promise<void> {
  const saved = await admin.get<{ policy: Record<string, unknown> }>('/settings/workforce');
  const travel = saved.policy.travel as Record<string, unknown>;
  await admin.put('/settings/workforce', {
    ...saved.policy,
    travel: { ...travel, autoApprove: true },
  });
  try {
    const next = new Date(`${indiaDate()}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    await runTravelMorningJob(acceptanceDb().db, next.toISOString().slice(0, 10));
  } finally {
    await admin.put('/settings/workforce', saved.policy);
  }
}
