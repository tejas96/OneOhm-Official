import {
  type DatabaseExecutor,
  type MonthUnlock,
  monthSheetRows,
  monthSheets,
  users,
} from '@oneohm/database';
import { eq, inArray } from 'drizzle-orm';
import type { Frozen } from './month-sheet-shape';

export interface SheetState {
  readonly id: string | null;
  readonly month: string;
  readonly status: 'open' | 'locked';
  readonly lockedAt: Date | null;
  readonly lockedBy: string | null;
  readonly unlocks: readonly MonthUnlock[];
}

/** The month's lock state; a month nobody locked yet is open with no history. */
export async function readSheet(db: DatabaseExecutor, month: string): Promise<SheetState> {
  const [row] = await db.select().from(monthSheets).where(eq(monthSheets.month, month)).limit(1);
  if (!row) return { id: null, month, status: 'open', lockedAt: null, lockedBy: null, unlocks: [] };
  return {
    id: row.id,
    month,
    status: row.status,
    lockedAt: row.lockedAt,
    lockedBy: row.lockedBy,
    unlocks: row.unlocks,
  };
}

/** Frozen rows by person, only while the month is locked (an unlocked month reads live). */
export async function frozenRows(
  db: DatabaseExecutor,
  sheet: SheetState,
  ids?: readonly string[],
): Promise<Map<string, Frozen>> {
  if (sheet.status !== 'locked' || !sheet.id) return new Map();
  const rows = await db
    .select({
      userId: monthSheetRows.userId,
      breakdown: monthSheetRows.breakdown,
      frozenAt: monthSheetRows.frozenAt,
    })
    .from(monthSheetRows)
    .where(eq(monthSheetRows.sheetId, sheet.id));
  const wanted = ids ? new Set(ids) : null;
  return new Map(
    rows
      .filter((row) => !wanted || wanted.has(row.userId))
      .map((row) => [row.userId, { breakdown: row.breakdown, frozenAt: row.frozenAt }]),
  );
}

/** The lock part of a response: who locked it, and each unlock with who and why. */
export async function lockOut(db: DatabaseExecutor, sheet: SheetState) {
  const ids = [
    ...new Set(
      [sheet.lockedBy, ...sheet.unlocks.map((one) => one.byUserId)].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  ];
  const names = ids.length
    ? await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const ref = (id: string) => ({
    id,
    fullName: names.find((one) => one.id === id)?.fullName ?? '',
  });
  return {
    month: sheet.month,
    status: sheet.status,
    lockedAt: sheet.status === 'locked' ? (sheet.lockedAt?.toISOString() ?? null) : null,
    lockedBy: sheet.status === 'locked' && sheet.lockedBy ? ref(sheet.lockedBy) : null,
    unlocks: sheet.unlocks.map((one) => ({
      at: one.at,
      by: ref(one.byUserId),
      reason: one.reason,
    })),
  };
}
