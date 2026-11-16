import type { DutyAlert } from '@oneohm/api-contracts';
import { type DatabaseExecutor, dutyAlerts, resolveDutyAlert, users } from '@oneohm/database';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { watchedPeople } from '../workforce/duty-scope';

const seenUser = alias(users, 'seen_user');

/** The alerts with their person and who saw them. */
async function readAlerts(db: DatabaseExecutor, where: ReturnType<typeof and>) {
  return db
    .select({
      alert: dutyAlerts,
      fullName: users.fullName,
      phone: users.phoneE164,
      seenName: seenUser.fullName,
    })
    .from(dutyAlerts)
    .innerJoin(users, eq(users.id, dutyAlerts.personId))
    .leftJoin(seenUser, eq(seenUser.id, dutyAlerts.seenBy))
    .where(where)
    .orderBy(desc(dutyAlerts.createdAt));
}

type AlertRow = Awaited<ReturnType<typeof readAlerts>>[number];

function present(row: AlertRow): DutyAlert {
  const { alert } = row;
  const label = alert.detail.label;
  return {
    id: alert.id,
    kind: alert.kind,
    severity: alert.severity,
    day: alert.day,
    title: alert.title,
    person: { id: alert.personId, fullName: row.fullName, phone: row.phone },
    subject: {
      type: alert.subjectType,
      id: alert.subjectId,
      label: typeof label === 'string' ? label : null,
    },
    detail: { ...alert.detail },
    createdAt: alert.createdAt.toISOString(),
    seenAt: alert.seenAt?.toISOString() ?? null,
    seenBy: alert.seenBy && row.seenName ? { id: alert.seenBy, fullName: row.seenName } : null,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    resolvedReason: alert.resolvedReason,
  };
}

/** Open alerts about the people the caller looks after (`watchedPeople`), newest first. */
export async function openAlerts(db: DatabaseExecutor, actor: Actor): Promise<DutyAlert[]> {
  const ids = (await watchedPeople(db, actor)).map((person) => person.id);
  if (ids.length === 0) return [];
  const rows = await readAlerts(
    db,
    and(inArray(dutyAlerts.personId, ids), isNull(dutyAlerts.resolvedAt)),
  );
  return rows.map(present);
}

/** Open and red alert counts per person, for the badge on each pin. */
export async function alertCounts(
  db: DatabaseExecutor,
  ids: readonly string[],
): Promise<Map<string, { open: number; red: number }>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      personId: dutyAlerts.personId,
      open: sql<number>`count(*)::int`,
      red: sql<number>`count(*) filter (where ${dutyAlerts.severity} = 'red')::int`,
    })
    .from(dutyAlerts)
    .where(and(inArray(dutyAlerts.personId, [...ids]), isNull(dutyAlerts.resolvedAt)))
    .groupBy(dutyAlerts.personId);
  return new Map(rows.map((row) => [row.personId, { open: row.open, red: row.red }]));
}

/** One alert about someone the caller looks after; anyone else's is not found. */
async function alertInScope(db: DatabaseExecutor, actor: Actor, id: string): Promise<AlertRow> {
  const ids = (await watchedPeople(db, actor)).map((person) => person.id);
  const [row] = await readAlerts(db, and(eq(dutyAlerts.id, id)));
  if (!row || !ids.includes(row.alert.personId)) throw notFound('That alert');
  return row;
}

/** Marks the alert seen by the caller (the first one to see it is kept); it stays open. */
export async function seeAlert(db: DatabaseExecutor, actor: Actor, id: string): Promise<DutyAlert> {
  await alertInScope(db, actor, id);
  await db
    .update(dutyAlerts)
    .set({ seenAt: new Date(), seenBy: actor.userId })
    .where(and(eq(dutyAlerts.id, id), isNull(dutyAlerts.seenAt)));
  return present(await alertInScope(db, actor, id));
}

/** Closes the alert, by the caller, with their reason (or none). Closing twice is a conflict. */
export async function closeAlert(
  db: DatabaseExecutor,
  actor: Actor,
  id: string,
  reason: string | undefined,
): Promise<DutyAlert> {
  await alertInScope(db, actor, id);
  const done = await resolveDutyAlert(db, id, reason?.trim() || null, actor.userId);
  if (!done) throw conflict('This alert is already closed.', 'closed');
  return present(await alertInScope(db, actor, id));
}
