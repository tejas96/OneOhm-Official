import {
  chatOwnerFor,
  customerActions,
  customers,
  type Database,
  notifications,
  notifyCover,
  notifyHolders,
  notifyStaffHolders,
  projects,
} from '@oneohm/database';
import { workingMinutesBetween } from '@oneohm/domain';
import { and, asc, eq, gt, inArray, isNotNull, isNull, like, lte, ne, or, sql } from 'drizzle-orm';

const DAY = 86_400_000;
const UNTIL = 14 * DAY;
const PER_TICK = 200;
/** The least wall-clock time in which two working days (18 working hours) can pass. */
const MANAGER_NOT_BEFORE = 30 * 3_600_000;

const WHAT: Readonly<Record<string, (customer: string, slot: unknown) => string>> = {
  location: (customer) => `Check the location ${customer} sent`,
  pay: (customer) => `Record the payment ${customer} says they made`,
  visit_pick: (customer) => `Confirm the visit day ${customer} picked`,
  callback: (customer, slot) =>
    `Call ${customer} back${typeof slot === 'string' ? ` (they picked ${slot})` : ''}`,
};

/** One working day on the working clock (9:30 to 18:30), in minutes. */
const WORKING_DAY_MIN = 9 * 60;

/**
 * What a staff check is due for, counted in working time (Monday to Saturday 9:30 to 18:30, Sunday
 * closed): the person who asked after 1 working day, the manager after 2. Nothing after 14 days.
 */
export function checkDue(
  answeredAt: Date,
  now: Date,
  timeZone = 'Asia/Kolkata',
): 'owner' | 'manager' | null {
  if (now.getTime() - answeredAt.getTime() >= UNTIL) return null;
  const worked = workingMinutesBetween(answeredAt, now, timeZone);
  if (worked >= 2 * WORKING_DAY_MIN) return 'manager';
  return worked >= WORKING_DAY_MIN ? 'owner' : null;
}

/**
 * Staff checks (redesign §2.3): a location suggestion, a payment proof or a "To call" call-back the
 * customer answered waits for the team. After 1 day the person who asked is told, after 2 days the
 * project manager (else those who manage projects). Also a pin that waited for the customer to pick
 * a home for a day: the chat's person is told. Each alert has its own key, so a repeat says nothing.
 */
export async function queueActionChecks(
  db: Database,
  now: Date,
  timeZone = 'Asia/Kolkata',
): Promise<number> {
  const tierOf = sql<string | null>`${customerActions.payload}->>'checkedTier'`;
  const managerFrom = new Date(now.getTime() - MANAGER_NOT_BEFORE);
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
        inArray(customerActions.type, ['location', 'pay', 'callback', 'visit_pick']),
        or(
          and(eq(customerActions.status, 'received'), isNotNull(customerActions.doneAt)),
          and(
            eq(customerActions.status, 'open'),
            isNull(customerActions.requestedByUserId),
            isNull(customerActions.propertyId),
          ),
        ),
        gt(customerActions.createdAt, new Date(now.getTime() - UNTIL - 30 * DAY)),
        // A working day can pass in 9 hours; the working clock decides below.
        lte(customerActions.updatedAt, new Date(now.getTime() - 9 * 3_600_000)),
        // Rows already told at their last tier cannot crowd out new ones: all done after the
        // manager tier; after the owner tier they wait until the manager tier can be due.
        or(isNull(tierOf), ne(tierOf, 'manager')),
        or(isNull(tierOf), ne(tierOf, 'owner'), lte(customerActions.updatedAt, managerFrom)),
        or(isNull(projects.id), ne(projects.status, 'cancelled')),
      ),
    )
    .orderBy(asc(customerActions.updatedAt))
    .limit(PER_TICK);
  let done = 0;
  for (const row of waiting) if (await tellOnce(db, row, now, timeZone)) done += 1;
  return done;
}

interface Waiting {
  readonly action: typeof customerActions.$inferSelect;
  readonly customer: string;
  readonly phone: string;
  readonly manager: string | null;
}

/** The alert this answer is due for (owner at 1 day, manager at 2), or false when none is. */
async function tellOnce(db: Database, row: Waiting, now: Date, timeZone: string): Promise<boolean> {
  const { action, customer, phone, manager } = row;
  const parked = action.status === 'open';
  const due = checkDue(
    parked ? action.createdAt : (action.doneAt ?? action.updatedAt),
    now,
    timeZone,
  );
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
  // Once this tier's alert exists, nothing more is asked of the database or the notifier.
  const [told] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(like(notifications.dedupeKey, `${notice.dedupeKey}%`))
    .limit(1);
  if (told) {
    await markChecked(db, action, due);
    return false;
  }
  const owner =
    action.requestedByUserId ?? (await chatOwnerFor(db, { customerId: action.customerId, phone }));
  let sent = 0;
  if (due === 'owner') {
    sent = owner
      ? await notifyCover(db, owner, 'projects.manage', notice)
      : await notifyHolders(db, 'projects.manage', notice);
  } else if (manager) {
    sent = await notifyCover(db, manager, 'projects.manage', notice);
  } else {
    // No project (a pin waiting for its home, a call-back on a lead): the customer desk, not
    // everyone who manages projects.
    sent = await notifyStaffHolders(db, 'service.manage', notice);
  }
  // The tier is recorded either way, so a desk with nobody on it is not looked at every tick.
  await markChecked(db, action, due);
  if (sent === 0)
    console.warn(`action check ${action.id} (${due}): nobody to tell, will not ask again`);
  return sent > 0;
}

/** Remembers the tier an answer was last checked at (without moving its updated time). */
async function markChecked(
  db: Database,
  action: typeof customerActions.$inferSelect,
  tier: 'owner' | 'manager',
) {
  await db
    .update(customerActions)
    .set({ payload: { ...action.payload, checkedTier: tier }, updatedAt: action.updatedAt })
    .where(eq(customerActions.id, action.id));
}
