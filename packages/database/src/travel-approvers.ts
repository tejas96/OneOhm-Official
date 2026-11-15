import { TRAVEL_FINANCE_RIGHTS, TRAVEL_HR_RIGHT, travelClaimReviewers } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { answererFor } from './chat-answerer';
import type { DatabaseExecutor } from './client';
import { holdersOf, type Notice, notifyCover, notifyHolders } from './notify';
import { users } from './schema/identity.schema';
import { reportingLines } from './schema/reporting.schema';

/**
 * Each person's manager, and whoever covers for that manager today, for the people asked
 * (S10). A manager who has left counts for nobody; one who is away counts with their
 * backup (leave cover), when the backup is at work. Missing means no manager.
 */
export async function managerIdsOf(
  db: DatabaseExecutor,
  claimantIds: readonly string[],
): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  if (claimantIds.length === 0) return found;
  const rows = await db
    .select({ userId: reportingLines.userId, managerId: users.id, status: users.status })
    .from(reportingLines)
    .innerJoin(users, eq(users.id, reportingLines.managerUserId))
    .where(inArray(reportingLines.userId, [...claimantIds]));
  for (const row of rows) {
    if (row.status !== 'active') continue;
    const cover = await answererFor(db, row.managerId);
    found.set(row.userId, [...new Set([row.managerId, ...(cover ? [cover] : [])])]);
  }
  return found;
}

/** Active people who hold HR's right, and those who hold a finance right. */
export async function hrAndFinanceIds(
  db: DatabaseExecutor,
): Promise<{ hrIds: string[]; financeIds: string[] }> {
  const [hrIds, ...finance] = await Promise.all([
    holdersOf(db, TRAVEL_HR_RIGHT),
    ...TRAVEL_FINANCE_RIGHTS.map((right) => holdersOf(db, right)),
  ]);
  return { hrIds, financeIds: [...new Set(finance.flat())] };
}

/** Everyone who may decide each claimant's claim, for the approvals list. */
export async function travelReviewersOf(
  db: DatabaseExecutor,
  claimantIds: readonly string[],
): Promise<Map<string, readonly string[]>> {
  const [managers, people] = await Promise.all([
    managerIdsOf(db, claimantIds),
    hrAndFinanceIds(db),
  ]);
  return new Map(
    claimantIds.map((claimantId) => [
      claimantId,
      travelClaimReviewers({
        claimantId,
        managerIds: managers.get(claimantId) ?? [],
        ...people,
      }),
    ]),
  );
}

/**
 * Tells those who decide a claim that one is waiting: the person's manager first (or whoever
 * covers for them, else HR), and when the person has no manager, HR, then finance. The
 * claimant is never told. The holders' own cover and desk rules are in `notifyHolders`.
 */
export async function tellClaimDeciders(
  db: DatabaseExecutor,
  claimantId: string,
  notice: Notice,
): Promise<number> {
  const [line] = await db
    .select({ managerId: users.id })
    .from(reportingLines)
    .innerJoin(users, eq(users.id, reportingLines.managerUserId))
    .where(and(eq(reportingLines.userId, claimantId), eq(users.status, 'active')))
    .limit(1);
  if (line) return notifyCover(db, line.managerId, TRAVEL_HR_RIGHT, notice);
  const hr = await notifyHolders(db, TRAVEL_HR_RIGHT, notice, claimantId);
  if (hr > 0) return hr;
  return notifyHolders(db, TRAVEL_FINANCE_RIGHTS[0], notice, claimantId);
}
