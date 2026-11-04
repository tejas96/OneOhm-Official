import {
  chatOwnerFor,
  customerActions,
  customers,
  type Database,
  notifyCover,
  notifyHolders,
  projects,
} from '@oneohm/database';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';

const DAY = 86_400_000;
const UNTIL = 14 * DAY;
const PER_TICK = 200;

const WHAT: Readonly<Record<string, (customer: string, slot: unknown) => string>> = {
  location: (customer) => `Check the location ${customer} sent`,
  pay: (customer) => `Record the payment ${customer} says they made`,
  callback: (customer, slot) =>
    `Call ${customer} back${typeof slot === 'string' ? ` (they picked ${slot})` : ''}`,
};

/** What a staff check is due for, counted from when the customer answered. */
export function checkDue(answeredAt: Date, now: Date): 'owner' | 'manager' | null {
  const age = now.getTime() - answeredAt.getTime();
  if (age < DAY || age >= UNTIL) return null;
  return age >= 2 * DAY ? 'manager' : 'owner';
}

/**
 * Staff checks (redesign §2.3): a location suggestion, a payment proof or a "To call" call-back the
 * customer answered waits for the team. After 1 day the person who asked is told, after 2 days the
 * project manager (else those who manage projects). Also a pin that waited for the customer to pick
 * a home for a day: the chat's person is told. Each alert has its own key, so a repeat says nothing.
 */
export async function queueActionChecks(db: Database, now: Date): Promise<number> {
  const waiting = await db
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
        or(
          and(eq(customerActions.status, 'received'), isNotNull(customerActions.doneAt)),
          and(
            eq(customerActions.status, 'open'),
            isNull(customerActions.requestedByUserId),
            isNull(customerActions.propertyId),
          ),
        ),
        gt(customerActions.createdAt, new Date(now.getTime() - UNTIL - 30 * DAY)),
        lte(customerActions.updatedAt, new Date(now.getTime() - DAY)),
        or(isNull(projects.id), ne(projects.status, 'cancelled')),
      ),
    )
    .orderBy(asc(customerActions.updatedAt))
    .limit(PER_TICK);
  let done = 0;
  for (const row of waiting) if (await tellOnce(db, row, now)) done += 1;
  return done;
}

interface Waiting {
  readonly action: typeof customerActions.$inferSelect;
  readonly customer: string;
  readonly phone: string;
  readonly manager: string | null;
}

/** The alert this answer is due for (owner at 1 day, manager at 2), or false when none is. */
async function tellOnce(db: Database, row: Waiting, now: Date): Promise<boolean> {
  const { action, customer, phone, manager } = row;
  const parked = action.status === 'open';
  const due = checkDue(parked ? action.createdAt : (action.doneAt ?? action.updatedAt), now);
  if (!due) return false;
  const notice = {
    kind: parked ? 'location_home_waiting' : 'customer_action_check',
    title: parked
      ? `${customer} sent a location but has not said which home`
      : (WHAT[action.type]?.(customer, action.payload.slot) ?? `Check ${customer}'s answer`),
    body: parked
      ? 'Ask them which home it is for, or add it on the property yourself.'
      : due === 'manager'
        ? 'This has waited more than 2 days for the team.'
        : 'The customer answered and it waits for the team.',
    ...(action.projectId ? { subject: { type: 'project' as const, id: action.projectId } } : {}),
    dedupeKey: `action_check:${action.id}:${due}`,
  };
  const owner =
    action.requestedByUserId ?? (await chatOwnerFor(db, { customerId: action.customerId, phone }));
  const person = due === 'manager' ? manager : owner;
  if (person) await notifyCover(db, person, 'projects.manage', notice);
  else await notifyHolders(db, 'projects.manage', notice);
  return true;
}
