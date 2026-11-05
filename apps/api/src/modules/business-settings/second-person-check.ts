import { type DatabaseExecutor, holdersOf } from '@oneohm/database';
import { secondPersonSetupProblem } from '@oneohm/domain';
import { invalid } from '../../common/http/errors';

/**
 * "Second person needed above ₹X" may be switched on only if two different active people
 * can really cover it: one who approves payments and another who approves or records them.
 * Otherwise the only owner would be locked out of sending money.
 */
export async function assertSecondPersonCovered(
  db: DatabaseExecutor,
  limitPaise: number,
): Promise<void> {
  if (limitPaise <= 0) return;
  const [approvers, recorders] = await Promise.all([
    holdersOf(db, 'finance.approve_payments'),
    holdersOf(db, 'finance.record_payments'),
  ]);
  const ids = new Set([...approvers, ...recorders]);
  const problem = secondPersonSetupProblem(
    [...ids].map((userId) => ({
      userId,
      canApprove: approvers.includes(userId),
      canRecord: recorders.includes(userId),
    })),
  );
  if (problem) throw invalid(problem, { secondPersonAbovePaise: problem });
}
