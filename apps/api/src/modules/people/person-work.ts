import { type DatabaseExecutor, personWorkSettings } from '@oneohm/database';
import { loadState, openTaskLimit } from '@oneohm/domain';
import { inArray } from 'drizzle-orm';
import { loadPolicy } from '../workforce/policy';

type Tracking = 'on' | 'off' | null;

export interface WorkPatch {
  readonly openTaskLimit?: number | null | undefined;
  readonly tracking?: Tracking | undefined;
  /** Home or base place; null clears it. */
  readonly base?: { latitude: number; longitude: number; label: string | null } | null | undefined;
}

/**
 * Each person's open-task limit (their own, else the company default) and whether
 * location is switched on or off for them (PRD 3.12, 4.3), keyed by person.
 */
export async function workOf(db: DatabaseExecutor, ids: readonly string[]) {
  const [policy, rows] = await Promise.all([
    loadPolicy(db),
    ids.length
      ? db
          .select()
          .from(personWorkSettings)
          .where(inArray(personWorkSettings.userId, [...ids]))
      : Promise.resolve([]),
  ]);
  const byUser = new Map(rows.map((row) => [row.userId, row]));
  return (userId: string, open: number) => {
    const row = byUser.get(userId);
    const limit = openTaskLimit(row?.openTaskLimit, policy.capacity.defaultOpenTaskLimit);
    return {
      openTaskLimit: limit,
      personalTaskLimit: row?.openTaskLimit ?? null,
      loadState: loadState(open, limit),
      tracking: (row?.tracking ?? null) as Tracking,
      base:
        row?.baseLatitude != null && row.baseLongitude != null
          ? { latitude: row.baseLatitude, longitude: row.baseLongitude, label: row.baseLabel }
          : null,
    };
  };
}

/** Saves what changed; leaving both empty keeps the row so the history stays simple. */
export async function saveWork(db: DatabaseExecutor, userId: string, patch: WorkPatch) {
  const set = {
    ...(patch.openTaskLimit !== undefined ? { openTaskLimit: patch.openTaskLimit } : {}),
    ...(patch.tracking !== undefined ? { tracking: patch.tracking } : {}),
    ...(patch.base !== undefined
      ? {
          baseLatitude: patch.base?.latitude ?? null,
          baseLongitude: patch.base?.longitude ?? null,
          baseLabel: patch.base?.label?.trim() || null,
        }
      : {}),
  };
  if (Object.keys(set).length === 0) return;
  await db
    .insert(personWorkSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({
      target: personWorkSettings.userId,
      set: { ...set, updatedAt: new Date() },
    });
}
