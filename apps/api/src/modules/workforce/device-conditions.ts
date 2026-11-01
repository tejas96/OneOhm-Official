import { type DatabaseExecutor, readingConditions } from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import type { Position } from './tracking';

export type ConditionKind = 'check_in' | 'check_out' | 'site_check_in' | 'site_check_out';

export interface DeviceConditions {
  readonly batteryPercent: number | null;
  readonly charging: boolean | null;
  readonly network: 'wifi' | 'cellular' | 'none' | 'other' | null;
}

/**
 * Keeps the phone's battery and connection beside a location reading that was kept
 * (PRD 4.3). Nothing is stored when the reading itself was not kept, or the phone said
 * nothing; a repeat for the same reading is ignored.
 */
export async function saveConditions(
  db: DatabaseExecutor,
  input: {
    readonly userId: string;
    readonly kind: ConditionKind;
    readonly subjectId: string;
    readonly position: Position | null | undefined;
  },
): Promise<void> {
  const { position } = input;
  if (!position) return;
  const batteryPercent =
    typeof position.batteryPercent === 'number' ? Math.round(position.batteryPercent) : null;
  const charging = position.charging ?? null;
  const network = position.network ?? null;
  if (batteryPercent === null && charging === null && network === null) return;
  await db
    .insert(readingConditions)
    .values({
      userId: input.userId,
      kind: input.kind,
      subjectId: input.subjectId,
      batteryPercent,
      charging,
      network,
    })
    .onConflictDoNothing();
}

/** The conditions kept for some readings of one kind, by the day or visit they belong to. */
export async function conditionsFor(
  db: DatabaseExecutor,
  subjectIds: readonly string[],
  kind: ConditionKind,
): Promise<Map<string, DeviceConditions>> {
  if (subjectIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(readingConditions)
    .where(
      and(inArray(readingConditions.subjectId, [...subjectIds]), eq(readingConditions.kind, kind)),
    );
  return new Map(
    rows.map((row) => [
      row.subjectId,
      { batteryPercent: row.batteryPercent, charging: row.charging, network: row.network },
    ]),
  );
}
