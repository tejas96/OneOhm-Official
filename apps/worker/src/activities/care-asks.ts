import {
  customerActions,
  type Database,
  homeNameOf,
  messageTemplates,
  notifyHolders,
  queueCustomerMessage,
} from '@oneohm/database';
import { templateIsOn } from '@oneohm/domain';
import { daysBetween, titleCaseName, todayIn } from '@oneohm/shared';
import { and, eq, lt, sql } from 'drizzle-orm';
import { visitDay } from './after-sales';

export const DAY = 86_400_000;
/** The AMC renewal is chased this many days before the AMC ends, and the service team told at 7. */
export const AMC_REMIND_DAYS = 10;
const AMC_ALERT_DAYS = 7;
/** A rating nobody answered in this long is let go. */
const RATING_EXPIRES_DAYS = 30;

export async function on(db: Database, key: string) {
  const [row] = await db
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, key))
    .limit(1);
  return templateIsOn(key, row);
}

/**
 * A rating nobody answered in 30 days is let go: the ask is cancelled ("expired"), so it is gone from the
 * customer's Home. No message goes to the customer.
 */
export async function expireRatings(db: Database, now: Date): Promise<number> {
  const expired = await db
    .update(customerActions)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      updatedAt: now,
      payload: sql`${customerActions.payload} || '{"expired": true, "answer": "expired"}'::jsonb`,
    })
    .where(
      and(
        eq(customerActions.type, 'rating'),
        eq(customerActions.status, 'open'),
        lt(customerActions.createdAt, new Date(now.getTime() - RATING_EXPIRES_DAYS * DAY)),
      ),
    )
    .returning({ id: customerActions.id });
  return expired.length;
}

export type Given = {
  readonly action: typeof customerActions.$inferSelect;
  readonly customer: string;
  readonly phone: string;
  readonly code: string | null;
  readonly age: number;
  readonly working: boolean;
  readonly now: Date;
  readonly timeZone: string;
};

export async function fixed(db: Database, g: Given): Promise<boolean> {
  const { action } = g;
  let worked = false;
  // No answer in 2 days (or the template is off and nobody can chase it): the service desk is told, once.
  if (g.age >= 2 * DAY) {
    await notifyHolders(db, 'service.manage', {
      kind: 'problem_fixed_waiting',
      title: `${g.customer} has not said whether the problem is fixed`,
      body: 'Call them to check, then close it or reopen the request.',
      ...(action.projectId ? { subject: { type: 'project' as const, id: action.projectId } } : {}),
      dedupeKey: `fixed_waiting:${action.id}`,
    });
    worked = true;
  }
  if (g.age < DAY || g.age >= 7 * DAY || !g.working) return worked;
  if (!(await on(db, 'problem_fixed_check'))) return worked;
  return (
    (await queueCustomerMessage(
      db,
      g.phone,
      'problem_fixed_check',
      {
        customer: titleCaseName(g.customer),
        topic: String(action.payload.topic ?? 'your problem'),
        yesPayload: `fx:y:${action.id}`,
        stillPayload: `fx:n:${action.id}`,
      },
      `fixed_reminder:${action.id}`,
    )) || worked
  );
}

export async function renewal(db: Database, g: Given): Promise<boolean> {
  const { action } = g;
  const endsOn = String(action.payload.endsOn ?? '');
  if (!endsOn) return false;
  const left = daysBetween(todayIn(g.timeZone, g.now), endsOn);
  if (left < 0 || left > AMC_REMIND_DAYS) return false;
  // An offer made only now (it was due within the last days) is not chased at once.
  if (g.age < 5 * DAY) return false;
  let worked = false;
  if (left <= AMC_ALERT_DAYS) {
    await notifyHolders(db, 'service.manage', {
      kind: 'amc_renewal_waiting',
      title: `${g.customer} has not answered the AMC renewal offer`,
      body: `Their AMC ends on ${visitDay(endsOn)}. Call them to renew it.`,
      ...(action.projectId ? { subject: { type: 'project' as const, id: action.projectId } } : {}),
      dedupeKey: `amc_renewal_waiting:${action.id}`,
    });
    worked = true;
  }
  if (g.working && (await on(db, 'amc_renewal_offer')))
    worked =
      (await queueCustomerMessage(
        db,
        g.phone,
        'amc_renewal_offer',
        {
          customer: titleCaseName(g.customer),
          home: await homeNameOf(db, action.projectId, action.propertyId),
          date: visitDay(endsOn),
          renewPayload: `amc:renew:${action.id}`,
          talkPayload: `amc:talk:${action.id}`,
        },
        `amc_renewal_reminder:${action.id}`,
      )) || worked;
  return worked;
}
