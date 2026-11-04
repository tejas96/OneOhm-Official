import {
  chatOwnerFor,
  customerActions,
  customers,
  type Database,
  homeNameOf,
  notifyCover,
  notifyHolders,
  projects,
  queueCustomerMessage,
  users,
} from '@oneohm/database';
import { isWorkingTime } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { and, asc, eq, gt, inArray, isNull, lte, ne, or } from 'drizzle-orm';

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

const WHAT: Readonly<Record<string, string>> = {
  location: 'the location of their home',
  pay: 'a payment (or its proof)',
  callback: 'a time for a call back',
};

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
        inArray(customerActions.type, ['location', 'pay', 'callback']),
        eq(customerActions.status, 'open'),
        gt(customerActions.createdAt, new Date(now.getTime() - TEAM_UNTIL)),
        lte(customerActions.createdAt, new Date(now.getTime() - CUSTOMER_AFTER)),
        or(isNull(projects.id), ne(projects.status, 'cancelled')),
      ),
    )
    .orderBy(asc(customerActions.createdAt))
    .limit(PER_TICK);
  let done = 0;
  for (const row of open) {
    // A pin waiting for its home is the customer's own move; nobody asked.
    if (!row.action.requestedByUserId) continue;
    const due = actionReminderDue(row.action.createdAt, now);
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
  if (now.getTime() - action.createdAt.getTime() >= CUSTOMER_UNTIL) return false;
  if (action.type === 'callback') return remindCallback(db, row, `action_reminder:${action.id}`);
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
    title: `Still waiting for ${WHAT[action.type]} from ${customer}`,
    body:
      action.type === 'pay' && typeof left === 'number'
        ? `They were asked about ${formatInr(left)} more than 4 days ago. Please call them.`
        : 'The customer was asked more than 4 days ago and has not answered. Please call them.',
    ...(action.projectId ? { subject: { type: 'project' as const, id: action.projectId } } : {}),
    dedupeKey: `action_waiting:${action.id}`,
  };
  const person = action.requestedByUserId ?? manager;
  if (person) await notifyCover(db, person, 'projects.manage', notice);
  else await notifyHolders(db, 'projects.manage', notice);
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
