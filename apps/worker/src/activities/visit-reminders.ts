import {
  alertVisitOwner,
  customers,
  type Database,
  homeNameOf,
  languageOf,
  messageTemplates,
  projectActivities,
  projectTasks,
  queueCustomerMessage,
  serviceRequests,
  visits,
} from '@oneohm/database';
import {
  isPresenceKind,
  isWorkingTime,
  reminderDue,
  templateIsOn,
  VISIT_PHRASES,
  type VisitLanguage,
  visitDayLabel,
  visitDayStarted,
  visitMissed,
  visitReminderWhen,
  workingMinutesBetween,
} from '@oneohm/domain';
import { titleCaseName, todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

const PER_TICK = 200;
const WORKING_DAY_MIN = 9 * 60;

type Row = typeof visits.$inferSelect & {
  customer: string;
  phone: string;
  notify: boolean | null;
  /** The work itself is finished (task completed, request resolved). */
  finished: boolean;
};

const select = (db: Database) =>
  db
    .select({
      visit: visits,
      customer: customers.name,
      phone: customers.phoneE164,
      notify: projectTasks.notifyCustomer,
      finished: sql<boolean>`coalesce(${projectTasks.status} = 'completed', ${serviceRequests.status} = 'resolved', false)`,
    })
    .from(visits)
    .innerJoin(customers, eq(customers.id, visits.customerId))
    .leftJoin(projectTasks, eq(projectTasks.id, visits.taskId))
    .leftJoin(serviceRequests, eq(serviceRequests.id, visits.serviceRequestId));

const flat = (
  rows: {
    visit: typeof visits.$inferSelect;
    customer: string;
    phone: string;
    notify: boolean | null;
    finished: boolean;
  }[],
): Row[] => rows.map(({ visit, ...rest }) => ({ ...visit, ...rest }));

const language = async (db: Database, phone: string): Promise<VisitLanguage> => {
  const code = (await languageOf(db, phone)).slice(0, 2);
  return code === 'mr' || code === 'hi' ? code : 'en';
};

/** A task's visit messages the customer only when its template says so (PRD 6.2); other kinds always. */
const mayMessage = (row: Row) => row.taskId === null || row.notify === true;

/**
 * Visits (redesign §8), once per tick: the day-before reminder in working hours, the staff alert
 * when the customer has not confirmed by the visit morning (or a DISCOM date by 1 working day),
 * and a visit not marked done by the end of its day is missed. Each step has its own flag or key,
 * so a repeated tick says nothing twice.
 */
export async function queueVisitReminders(
  db: Database,
  now: Date,
  timeZone: string,
): Promise<number> {
  const open = flat(
    await select(db)
      .where(inArray(visits.status, ['proposed', 'confirmed']))
      .orderBy(asc(visits.day))
      .limit(PER_TICK),
  );
  let done = 0;
  for (const row of open) {
    if (row.status === 'confirmed' && row.finished) done += (await markDone(db, row, now)) ? 1 : 0;
    else if (visitMissed(row.day, now, timeZone)) done += (await markMissed(db, row, now)) ? 1 : 0;
    else if (row.status === 'confirmed') {
      done += (await remind(db, row, now, timeZone)) ? 1 : 0;
      done += (await alertUnconfirmed(db, row, now, timeZone)) ? 1 : 0;
    }
  }
  return done;
}

async function templateOn(db: Database, key: string) {
  const [row] = await db
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, key))
    .limit(1);
  return templateIsOn(key, row);
}

/** "Our team visits Sangli tomorrow morning for the installation." [Confirm] [Change day]. */
async function remind(db: Database, row: Row, now: Date, timeZone: string): Promise<boolean> {
  if (row.reminderSentAt || isPresenceKind(row.kind) || !mayMessage(row)) return false;
  const today = todayIn(timeZone, now);
  const due = reminderDue({
    visitDay: row.day,
    confirmedOn: todayIn(timeZone, row.confirmedAt ?? row.createdAt),
    today,
    working: isWorkingTime(now, timeZone),
  });
  if (!due) return false;
  const lang = await language(db, row.phone);
  const claimed = await db
    .update(visits)
    .set({ reminderSentAt: now, updatedAt: now })
    .where(and(eq(visits.id, row.id), isNull(visits.reminderSentAt)))
    .returning({ id: visits.id });
  if (claimed.length === 0) return false;
  if (!(await templateOn(db, 'visit_reminder'))) return false;
  await queueCustomerMessage(
    db,
    row.phone,
    'visit_reminder',
    {
      customer: titleCaseName(row.customer),
      home: await homeNameOf(db, row.projectId, row.propertyId),
      when: visitReminderWhen(row.day, today, row.slot, lang),
      work: VISIT_PHRASES[lang].work[row.kind],
      confirmPayload: `vcf:${row.id}`,
      changePayload: `vchg:${row.id}`,
    },
    `visit_reminder:${row.id}:${row.day}:${row.slot}`,
  );
  return true;
}

/**
 * No reply by the visit morning: the owner is told once. A DISCOM date the customer has not
 * answered after 1 working day is told the same way.
 */
async function alertUnconfirmed(db: Database, row: Row, now: Date, timeZone: string) {
  if (row.unconfirmedAlertAt || row.customerConfirmedAt || row.customerCannotAt) return false;
  const presence = isPresenceKind(row.kind);
  const waited = presence
    ? row.toldAt !== null && workingMinutesBetween(row.toldAt, now, timeZone) >= WORKING_DAY_MIN
    : row.reminderSentAt !== null &&
      visitDayStarted(row.day, now, timeZone) &&
      isWorkingTime(now, timeZone);
  if (!waited) return false;
  const claimed = await db
    .update(visits)
    .set({ unconfirmedAlertAt: now })
    .where(and(eq(visits.id, row.id), isNull(visits.unconfirmedAlertAt)))
    .returning({ id: visits.id });
  if (claimed.length === 0) return false;
  const day = visitDayLabel(row.day, 'en');
  await alertVisitOwner(db, row, {
    kind: 'visit_not_confirmed',
    title: `${row.customer} has not confirmed ${presence ? `the visit on ${day}` : "today's visit"}`,
    body: presence
      ? 'They were told the DISCOM date and have not answered. Please call them.'
      : 'They did not answer the reminder. Please call them before the team goes.',
    key: `visit_unconfirmed:${row.id}`,
  });
  return true;
}

/** The task was completed or the request resolved: the visit happened, whoever did not tick it. */
async function markDone(db: Database, row: Row, now: Date): Promise<boolean> {
  const marked = await db
    .update(visits)
    .set({ status: 'done', doneAt: now, updatedAt: now })
    .where(and(eq(visits.id, row.id), eq(visits.status, 'confirmed')))
    .returning({ id: visits.id });
  return marked.length > 0;
}

/** Not marked done by the end of its day: missed; the owner decides (done late, or a new day). */
async function markMissed(db: Database, row: Row, now: Date): Promise<boolean> {
  const marked = await db
    .update(visits)
    .set({ status: 'missed', missedAt: now, updatedAt: now })
    .where(and(eq(visits.id, row.id), inArray(visits.status, ['proposed', 'confirmed'])))
    .returning({ id: visits.id });
  if (marked.length === 0) return false;
  const day = visitDayLabel(row.day, 'en');
  if (row.projectId)
    await db.insert(projectActivities).values({
      projectId: row.projectId,
      taskId: row.taskId,
      kind: 'visit',
      message: `Visit on ${day} was not marked done: marked missed`,
      data: { visitId: row.id },
    });
  await alertVisitOwner(db, row, {
    kind: 'visit_missed',
    title: `Visit to ${row.customer} on ${day} was not marked done`,
    body: 'Mark it done if it happened, or book a new day with the customer.',
    key: `visit_missed:${row.id}`,
  });
  return true;
}
