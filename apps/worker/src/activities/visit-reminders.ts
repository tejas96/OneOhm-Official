import {
  alertVisitOwner,
  customers,
  type Database,
  homeNameOf,
  languageOf,
  messageTemplates,
  projectTasks,
  queueCustomerMessage,
  serviceRequests,
  visits,
} from '@oneohm/database';
import {
  isPresenceKind,
  isWorkingTime,
  previousWorkingDay,
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
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alertProposed, markDone, markMissed } from './visit-closing';
import { claimAlert, type Row } from './visit-row';

const PER_TICK = 200;
const WORKING_DAY_MIN = 9 * 60;

/** The work itself is finished: the task is completed or the request resolved. */
const finishedNow = sql`coalesce(${projectTasks.status} = 'completed', ${serviceRequests.status} = 'resolved', false)`;

const select = (db: Database) =>
  db
    .select({
      visit: visits,
      customer: customers.name,
      phone: customers.phoneE164,
      notify: projectTasks.notifyCustomer,
      finished: sql<boolean>`${finishedNow}`,
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
      .where(
        or(
          inArray(visits.status, ['proposed', 'confirmed']),
          // A missed visit stays in view only while its work turns out to be finished.
          and(eq(visits.status, 'missed'), finishedNow),
        ),
      )
      .orderBy(asc(visits.day))
      .limit(PER_TICK),
  );
  let done = 0;
  for (const row of open) done += (await step(db, row, now, timeZone)) ? 1 : 0;
  return done;
}

/** What one open visit is due for this tick; true when it did something. */
async function step(db: Database, row: Row, now: Date, timeZone: string): Promise<boolean> {
  if (row.finished && row.status !== 'proposed') return markDone(db, row, now);
  if (row.status === 'missed') return false;
  if (visitMissed(row.day, now, timeZone)) return markMissed(db, row, now);
  if (row.status === 'proposed') return alertProposed(db, row, now, timeZone);
  const reminded = await remind(db, row, now, timeZone);
  return (await alertUnconfirmed(db, row, now, timeZone)) || reminded;
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
  // With the message off nothing is sent and nothing is marked: the visit morning alert says so.
  if (!due || !(await templateOn(db, 'visit_reminder'))) return false;
  const lang = await language(db, row.phone);
  await queueCustomerMessage(
    db,
    row.phone,
    'visit_reminder',
    {
      customer: titleCaseName(row.customer),
      home: await homeNameOf(db, row.projectId, row.propertyId),
      when: visitReminderWhen(row.day, today, row.slot, lang),
      work: VISIT_PHRASES[lang].work[row.kind],
      confirmPayload: `vcf:${row.id}:${row.day}`,
      changePayload: `vchg:${row.id}:${row.day}`,
    },
    `visit_reminder:${row.id}:${row.day}:${row.slot}`,
  );
  // Marked only once it is queued; the key above makes a repeat harmless.
  await db
    .update(visits)
    .set({ reminderSentAt: now, updatedAt: now })
    .where(and(eq(visits.id, row.id), isNull(visits.reminderSentAt)));
  return true;
}

/**
 * No reply by the visit morning: the owner is told once, saying whether a reminder reached the
 * customer. A DISCOM date unanswered after 1 working day is told the same way, and again the
 * working day before it. Nothing for a task whose customer is not messaged (PRD 6.2).
 */
async function alertUnconfirmed(db: Database, row: Row, now: Date, timeZone: string) {
  if (!mayMessage(row) || row.customerConfirmedAt || row.customerCannotAt) return false;
  const presence = isPresenceKind(row.kind);
  const day = visitDayLabel(row.day, 'en');
  if (
    presence &&
    previousWorkingDay(row.day) === todayIn(timeZone, now) &&
    isWorkingTime(now, timeZone)
  ) {
    // The key makes this one alert, whatever the number of ticks.
    await alertVisitOwner(db, row, {
      kind: 'visit_not_confirmed',
      title: `${visitName(row)} is tomorrow and ${row.customer} has not confirmed`,
      body: `They were told the DISCOM date (${day}) and have not answered. Please call them.`,
      key: `visit_presence_tomorrow:${row.id}`,
    });
  }
  if (row.unconfirmedAlertAt) return false;
  const confirmedOn = todayIn(timeZone, row.confirmedAt ?? row.createdAt);
  const waited = presence
    ? row.toldAt !== null && workingMinutesBetween(row.toldAt, now, timeZone) >= WORKING_DAY_MIN
    : visitDayStarted(row.day, now, timeZone) &&
      isWorkingTime(now, timeZone) &&
      // A visit booked for the day itself was never due a reminder.
      (row.reminderSentAt !== null || confirmedOn < row.day);
  if (!waited || !(await claimAlert(db, row, now))) return false;
  await alertVisitOwner(db, row, {
    kind: 'visit_not_confirmed',
    title: `${row.customer} has not confirmed ${presence ? `the visit on ${day}` : "today's visit"}`,
    body: presence
      ? 'They were told the DISCOM date and have not answered. Please call them.'
      : row.reminderSentAt
        ? 'They did not answer the reminder. Please call them before the team goes.'
        : 'No reminder reached them (the message is off). Please call them before the team goes.',
    key: `visit_unconfirmed:${row.id}`,
  });
  return true;
}

const visitName = (row: Row) =>
  row.kind === 'net_meter' ? 'Net meter fitting' : 'DISCOM inspection';
