import {
  leaveManagerReviews,
  leaveRequests,
  notify,
  reportingLines,
  type Transaction,
} from '@oneohm/database';
import { eq, inArray } from 'drizzle-orm';
import { DEPARTURE_NOTICES } from './departure-notices';
import { newManagers } from './departure-rules';

/** Someone in a handover: the leaver or the person covering. */
export interface PersonRef {
  readonly id: string;
  readonly fullName: string;
}

// The people side of a handover: reporting lines, leave reviews and leave backups.

/** Direct reports move under the target; the target itself moves up (`newManagers`). */
export async function moveReports(
  tx: Transaction,
  actorId: string,
  from: string,
  to: string,
  reportIds: readonly string[],
): Promise<Map<string, string | null>> {
  const [line] = await tx
    .select({ managerUserId: reportingLines.managerUserId })
    .from(reportingLines)
    .where(eq(reportingLines.userId, from));
  const moves = newManagers({
    leaverId: from,
    leaverManagerId: line?.managerUserId ?? null,
    targetId: to,
    reportIds,
  });
  for (const [userId, managerUserId] of moves) {
    if (managerUserId === null) {
      await tx.delete(reportingLines).where(eq(reportingLines.userId, userId));
      continue;
    }
    await tx
      .insert(reportingLines)
      .values({ userId, managerUserId, updatedByUserId: actorId })
      .onConflictDoUpdate({
        target: reportingLines.userId,
        set: { managerUserId, updatedByUserId: actorId, updatedAt: new Date() },
      });
  }
  return moves;
}

/**
 * Leave waiting on the leaver's first look goes to the target. The target's own leave goes
 * to the target's new manager instead, or skips the first look when there is none.
 */
export async function moveLeaveReviews(
  tx: Transaction,
  to: string,
  leaveIds: readonly string[],
  reportMoves: ReadonlyMap<string, string | null>,
): Promise<number> {
  if (leaveIds.length === 0) return 0;
  const rows = await tx
    .select({ id: leaveRequests.id, userId: leaveRequests.userId })
    .from(leaveRequests)
    .where(inArray(leaveRequests.id, [...leaveIds]));
  const own = rows.filter((row) => row.userId === to).map((row) => row.id);
  const others = rows.filter((row) => row.userId !== to).map((row) => row.id);
  if (others.length > 0)
    await tx
      .update(leaveManagerReviews)
      .set({ managerUserId: to })
      .where(inArray(leaveManagerReviews.leaveRequestId, others));
  if (own.length > 0) {
    const reviewer = reportMoves.get(to) ?? null;
    const reviews = inArray(leaveManagerReviews.leaveRequestId, own);
    if (reviewer)
      await tx.update(leaveManagerReviews).set({ managerUserId: reviewer }).where(reviews);
    else await tx.delete(leaveManagerReviews).where(reviews);
  }
  return others.length;
}

/** The target becomes the backup on approved leave, and the person on leave is told. */
export async function moveBackups(
  tx: Transaction,
  leaver: PersonRef,
  target: PersonRef,
  leaveIds: readonly string[],
): Promise<number> {
  if (leaveIds.length === 0) return 0;
  const rows = await tx
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
    })
    .from(leaveRequests)
    .where(inArray(leaveRequests.id, [...leaveIds]));
  let moved = 0;
  for (const leave of rows) {
    // Nobody backs up their own leave.
    const backup = leave.userId === target.id ? null : target.id;
    await tx
      .update(leaveRequests)
      .set({ backupUserId: backup, updatedAt: new Date() })
      .where(eq(leaveRequests.id, leave.id));
    if (!backup) continue;
    moved += 1;
    await notify(
      tx,
      { userId: leave.userId },
      DEPARTURE_NOTICES.newBackup(leave, leaver.fullName, target),
    );
  }
  return moved;
}
