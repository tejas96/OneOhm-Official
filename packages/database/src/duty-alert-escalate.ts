import { alertDigestTitle, ESCALATE_MAX_DAYS } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, gte, isNull, lt, sql } from 'drizzle-orm';
import { businessTimeZone } from './business-calendar';
import type { DatabaseExecutor } from './client';
import { notify } from './notify';
import { dutyAlerts } from './schema/duty-alerts.schema';

/**
 * The morning after (spec "Nothing goes silent"): duty alerts raised on the last two days
 * before today that nobody resolved go up to the owners as one digest each ("7 field alerts
 * from yesterday still open"), opening the live map's alerts. Alerts raised earlier than that
 * are not raised again. Nobody's own alerts are counted for them. Returns how many owners
 * were told.
 */
export async function escalateDutyAlerts(
  db: DatabaseExecutor,
  today: string,
  ownerIds: readonly string[],
  timeZone: string = businessTimeZone(),
): Promise<number> {
  if (ownerIds.length === 0) return 0;
  const raisedOn = sql<string>`(${dutyAlerts.createdAt} at time zone ${timeZone})::date`;
  const yesterday = addDays(today, -1);
  const open = await db
    .select({ personId: dutyAlerts.personId, raisedOn: sql<string>`${raisedOn}::text` })
    .from(dutyAlerts)
    .where(
      and(
        isNull(dutyAlerts.resolvedAt),
        lt(raisedOn, today),
        gte(raisedOn, addDays(today, -ESCALATE_MAX_DAYS)),
      ),
    );
  let told = 0;
  for (const userId of ownerIds) {
    const theirs = open.filter((alert) => alert.personId !== userId);
    if (theirs.length === 0) continue;
    const onlyYesterday = theirs.every((alert) => alert.raisedOn === yesterday);
    await notify(
      db,
      { userId },
      {
        kind: 'duty_alerts_digest',
        title: alertDigestTitle(theirs.length, onlyYesterday),
        body: "Open the live map's alerts to deal with them.",
        dedupeKey: `duty_alerts_digest:${today}:${userId}`,
      },
    );
    told += 1;
  }
  return told;
}

/** Duty alerts of days before the cut-off are deleted with the route (retention). */
export async function deleteOldDutyAlerts(db: DatabaseExecutor, before: string): Promise<number> {
  const gone = await db
    .delete(dutyAlerts)
    .where(lt(dutyAlerts.day, before))
    .returning({ id: dutyAlerts.id });
  return gone.length;
}
