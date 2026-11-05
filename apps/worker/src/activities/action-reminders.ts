import {
  customerActions,
  customers,
  type Database,
  homeNameOf,
  notifyCover,
  notifyHolders,
  projects,
  queueCustomerMessage,
  routeOfCustomer,
} from '@oneohm/database';
import { isWorkingTime } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { capabilityOf } from './action-capability';
import {
  type Row,
  remindCallback,
  remindJourney,
  remindSurvey,
  remindVisitPick,
} from './action-reminder-asks';
import {
  askedSince,
  isLayoutHandled,
  isSubsidyWait,
  waitingBody,
  waitingFor,
} from './journey-reminders';
import { chaseSubsidy, expireBankSigns } from './step-chase';
import { abandonSurveys } from './survey-abandon';

const DAY = 24 * 3_600_000;
const CUSTOMER_AFTER = 2 * DAY;
const CUSTOMER_UNTIL = 7 * DAY;
const TEAM_AFTER = 4 * DAY;
const TEAM_UNTIL = 14 * DAY;
/** An ask still open after this long is also told to the project manager (the desk), not only the asker. */
const MANAGER_AFTER = 7 * DAY;
const PER_TICK = 200;

/** What an open "Send to customer" ask is due for, counted from when it was asked. */
export function actionReminderDue(askedAt: Date, now: Date): 'customer' | 'team' | null {
  const age = now.getTime() - askedAt.getTime();
  if (age < CUSTOMER_AFTER || age >= TEAM_UNTIL) return null;
  return age >= TEAM_AFTER ? 'team' : 'customer';
}

/**
 * Open location, payment and call-back asks (redesign §2.3): a location (or a call time) is asked again at 2 days
 * (working hours, the approved template); the person who asked hears at 4 days for all three.
 * Payments are chased by the payment reminders already, so the customer is not messaged twice.
 * Each reminder and alert has its own key, so a repeated tick says nothing twice.
 */
export async function queueActionReminders(
  db: Database,
  now: Date,
  timeZone: string,
): Promise<number> {
  // The day to sign at the bank has passed: that ask closes itself before anything is chased.
  await expireBankSigns(db, now, timeZone);
  await abandonSurveys(db, now);
  const open = await db
    .select({
      action: customerActions,
      customer: customers.name,
      phone: customers.phoneE164,
      manager: projects.managerUserId,
    })
    .from(customerActions)
    .innerJoin(customers, eq(customers.id, customerActions.customerId))
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .where(
      and(
        inArray(customerActions.type, [
          'location',
          'pay',
          'callback',
          'visit_pick',
          'confirm',
          'signature',
          'self_survey',
        ]),
        eq(customerActions.status, 'open'),
        // The fixed check and the AMC renewal offer are not chased with the journey reminders.
        sql`coalesce(${customerActions.payload}->>'kind', '') not in ('problem_fixed', 'amc_renewal')`,
        // Asks older than 14 days are over; only a roof answered "Not yet" counts from its answer, so
        // it may be older (up to 56 days), and nothing else can crowd the batch.
        or(
          gt(customerActions.createdAt, new Date(now.getTime() - TEAM_UNTIL)),
          and(
            sql`${customerActions.payload}->>'answer' = 'not_yet'`,
            gt(customerActions.createdAt, new Date(now.getTime() - 4 * TEAM_UNTIL)),
          ),
        ),
        lte(customerActions.createdAt, new Date(now.getTime() - CUSTOMER_AFTER)),
        or(isNull(projects.id), ne(projects.status, 'cancelled')),
      ),
    )
    .orderBy(asc(customerActions.createdAt))
    .limit(PER_TICK);
  let done = 0;
  for (const row of open) {
    // A pin waiting for its home is the customer's own move; nobody asked. The system asks the visit
    // day and the roof and installation questions itself. Once a paper is agreed to, its signed copy
    // is a paper of its own and is chased as one.
    const bySystem = ['visit_pick', 'confirm', 'self_survey'].includes(row.action.type);
    if (!row.action.requestedByUserId && !bySystem) continue;
    if (row.action.type === 'signature' && row.action.payload.signedActionId) continue;
    // A subsidy that has not arrived waits for the money, not for an answer: the owner hears after the set days.
    if (isSubsidyWait(row.action) || isLayoutHandled(row.action)) continue;
    const due = actionReminderDue(askedSince(row.action), now);
    // The ask of a customer off WhatsApp was handed to the team; there is no chat to remind them in.
    if (
      due === 'customer' &&
      (await inChat(db, row.action)) &&
      (await remindCustomer(db, row, now, timeZone))
    )
      done += 1;
    // The self survey is optional: nobody on the team is told to "call them" about it. The team hears in
    // working hours only (a later tick tells them); the manager joins at 7 days.
    if (due === 'team' && row.action.type !== 'self_survey' && isWorkingTime(now, timeZone)) {
      await alertAsker(db, row, now);
      done += 1;
    }
  }
  return done + (await chaseSubsidy(db, now));
}

/**
 * Whether the customer is reminded in the chat or by SMS: an ask done in person was handed to the team, so
 * it is not chased with a message. An ask with no recorded channel follows the customer's route.
 */
async function inChat(db: Database, action: typeof customerActions.$inferSelect) {
  const channel = action.payload.channel;
  if (typeof channel === 'string') return channel !== 'in_person';
  return (await routeOfCustomer(db, action.customerId)) === 'whatsapp';
}

/** A location is asked again with the approved template, in working hours. */
async function remindCustomer(db: Database, row: Row, now: Date, timeZone: string) {
  const { action } = row;
  if (!isWorkingTime(now, timeZone)) return false;
  if (now.getTime() - askedSince(action).getTime() >= CUSTOMER_UNTIL) return false;
  if (action.type === 'callback') return remindCallback(db, row, `action_reminder:${action.id}`);
  if (action.type === 'visit_pick') return remindVisitPick(db, row, `action_reminder:${action.id}`);
  if (action.type === 'confirm' || action.type === 'signature')
    return remindJourney(db, row, `action_reminder:${action.id}`);
  if (action.type === 'self_survey') return remindSurvey(db, row, `action_reminder:${action.id}`);
  if (action.type !== 'location') return false;
  const home = await homeNameOf(db, action.projectId, action.propertyId);
  return queueCustomerMessage(
    db,
    row.phone,
    'location_request',
    { customer: titleCaseName(row.customer), home, locationPayload: `locreq:${action.id}` },
    `action_reminder:${action.id}`,
  );
}

/**
 * The person who asked (else the project's manager, else those who manage that kind of work) is told once; at
 * 7 days the project manager (else the desk) is told too, once.
 */
async function alertAsker(db: Database, { action, customer, manager }: Row, now: Date) {
  const left = action.payload.leftPaise;
  const notice = {
    kind: 'customer_action_waiting',
    title: `Still waiting for ${waitingFor(action)} from ${customer}`,
    body:
      action.type === 'pay' && typeof left === 'number'
        ? `They were asked about ${formatInr(left)} more than 4 days ago. Please call them.`
        : waitingBody(action),
    ...(action.projectId ? { subject: { type: 'project' as const, id: action.projectId } } : {}),
    dedupeKey: `action_waiting:${action.id}`,
  };
  const person = action.requestedByUserId ?? manager;
  const capability = capabilityOf(action);
  if (person) await notifyCover(db, person, capability, notice);
  else await notifyHolders(db, capability, notice);
  if (now.getTime() - askedSince(action).getTime() < MANAGER_AFTER) return;
  const escalation = {
    ...notice,
    body: `${customer} has not answered for more than 7 days. Please follow it up.`,
    dedupeKey: `action_waiting:${action.id}:manager`,
  };
  if (manager && manager !== person) await notifyCover(db, manager, capability, escalation);
  else await notifyHolders(db, capability, escalation, person);
}
