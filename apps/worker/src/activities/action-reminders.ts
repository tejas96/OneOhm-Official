import {
  chatOwnerFor,
  customerActions,
  customers,
  type Database,
  homeNameOf,
  languageOf,
  notifyCover,
  notifyHolders,
  projects,
  queueCustomerMessage,
  users,
} from '@oneohm/database';
import { isWorkingTime, VISIT_PHRASES, type VisitKind } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { capabilityOf } from './action-capability';
import {
  askedSince,
  confirmReminder,
  signatureReminder,
  waitingBody,
  waitingFor,
} from './journey-reminders';

const DAY = 24 * 3_600_000;
const CUSTOMER_AFTER = 2 * DAY;
const CUSTOMER_UNTIL = 7 * DAY;
const TEAM_AFTER = 4 * DAY;
const TEAM_UNTIL = 14 * DAY;
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
        ]),
        eq(customerActions.status, 'open'),
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
    const bySystem = ['visit_pick', 'confirm'].includes(row.action.type);
    if (!row.action.requestedByUserId && !bySystem) continue;
    if (row.action.type === 'signature' && row.action.payload.signedActionId) continue;
    const due = actionReminderDue(askedSince(row.action), now);
    if (due === 'customer' && (await remindCustomer(db, row, now, timeZone))) done += 1;
    if (due === 'team') {
      await alertAsker(db, row);
      done += 1;
    }
  }
  return done;
}

interface Row {
  readonly action: typeof customerActions.$inferSelect;
  readonly customer: string;
  readonly phone: string;
  readonly manager: string | null;
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

/** The person who asked (else the project's manager, else those who manage projects) is told once. */
async function alertAsker(db: Database, { action, customer, manager }: Row) {
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
}

/** The customer never picked a day for a visit: the same ask again, by the approved template. */
async function remindVisitPick(db: Database, { action, customer, phone }: Row, key: string) {
  const code = (await languageOf(db, phone)).slice(0, 2);
  const kind = (action.payload.visitKind as VisitKind | undefined) ?? 'service';
  const words = VISIT_PHRASES[code === 'mr' || code === 'hi' ? code : 'en'];
  return queueCustomerMessage(
    db,
    phone,
    'visit_pick',
    {
      customer: titleCaseName(customer),
      home: await homeNameOf(db, action.projectId, action.propertyId),
      work: words.work[kind],
      pickPayload: `vask:${action.id}`,
    },
    key,
  );
}

/** The customer never picked a time: the three buttons again, by the approved template. */
async function remindCallback(db: Database, { action, customer, phone }: Row, key: string) {
  const [owner] = await db
    .select({ name: users.fullName })
    .from(users)
    .where(
      eq(
        users.id,
        (await chatOwnerFor(db, { customerId: action.customerId, phone })) ??
          action.requestedByUserId ??
          '',
      ),
    );
  const tap = (slot: string) => `cb:${action.id}:${slot}`;
  return queueCustomerMessage(
    db,
    phone,
    'callback_request',
    {
      customer: titleCaseName(customer),
      staff: owner?.name.split(/\s+/)[0] ?? 'our team',
      morningPayload: tap('morning'),
      afternoonPayload: tap('afternoon'),
      eveningPayload: tap('evening'),
    },
    key,
  );
}

/** The roof or installation question, or the paper to agree to, again by its approved template. */
async function remindJourney(db: Database, { action, customer, phone }: Row, key: string) {
  const given = {
    customer: titleCaseName(customer),
    home: await homeNameOf(db, action.projectId, action.propertyId),
  };
  const { template, payload } =
    action.type === 'signature' ? signatureReminder(action, given) : confirmReminder(action, given);
  return queueCustomerMessage(db, phone, template, payload, key);
}
