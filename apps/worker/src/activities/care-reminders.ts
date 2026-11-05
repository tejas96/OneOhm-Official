import {
  customerActions,
  customers,
  type Database,
  homeNameOf,
  messageTemplates,
  notifyHolders,
  projects,
  queueCustomerMessage,
} from '@oneohm/database';
import { isWorkingTime, templateIsOn } from '@oneohm/domain';
import { daysBetween, formatInr, titleCaseName, todayIn } from '@oneohm/shared';
import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { visitDay } from './after-sales';

const DAY = 86_400_000;
const PER_TICK = 200;
/** The AMC renewal is chased this many days before the AMC ends, and the service team told at 7. */
const AMC_REMIND_DAYS = 10;
const AMC_ALERT_DAYS = 7;

const STAGE_NAME: Readonly<Record<string, string>> = {
  survey: 'site survey',
  installation: 'installation',
  commissioning: 'switch-on and handover',
};

async function on(db: Database, key: string) {
  const [row] = await db
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, key))
    .limit(1);
  return templateIsOn(key, row);
}

/**
 * Chases what the care flows asked (phase 6): a rating (the customer at 2 days, by the rating template; staff
 * hear when that template is off), the UPI ID of an approved reward (day 1, then every 2 days to day 14, in
 * working hours; finance hears at 2 days), the "Is it working now?" check (1 day) and the AMC renewal (a
 * marketing reminder 10 days before the AMC ends, the service team told at 7 when nobody answered). Every
 * message and alert has a key per ask round, so a repeated tick says nothing twice; a customer who said STOP
 * gets no marketing and no rating reminder (queueCustomerMessage skips them).
 */
export async function queueCareReminders(
  db: Database,
  now: Date,
  timeZone: string,
): Promise<number> {
  const open = await db
    .select({
      action: customerActions,
      customer: customers.name,
      phone: customers.phoneE164,
      code: projects.code,
    })
    .from(customerActions)
    .innerJoin(customers, eq(customers.id, customerActions.customerId))
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .where(
      and(
        eq(customerActions.status, 'open'),
        gt(customerActions.createdAt, new Date(now.getTime() - 30 * DAY)),
        or(
          inArray(customerActions.type, ['rating', 'payout']),
          sql`${customerActions.payload}->>'kind' in ('problem_fixed', 'amc_renewal')`,
        ),
      ),
    )
    .orderBy(asc(customerActions.createdAt))
    .limit(PER_TICK);
  const working = isWorkingTime(now, timeZone);
  let done = 0;
  for (const row of open) {
    const age = now.getTime() - row.action.createdAt.getTime();
    const given = { ...row, age, working, now, timeZone };
    const worked =
      row.action.type === 'rating'
        ? await rating(db, given)
        : row.action.type === 'payout'
          ? await payout(db, given)
          : row.action.payload.kind === 'problem_fixed'
            ? await fixed(db, given)
            : await renewal(db, given);
    if (worked) done += 1;
  }
  return done;
}

type Given = {
  readonly action: typeof customerActions.$inferSelect;
  readonly customer: string;
  readonly phone: string;
  readonly code: string | null;
  readonly age: number;
  readonly working: boolean;
  readonly now: Date;
  readonly timeZone: string;
};

async function rating(db: Database, g: Given): Promise<boolean> {
  const { action } = g;
  if (g.age < 2 * DAY || g.age >= 14 * DAY) return false;
  const stage = String(action.payload.stage ?? '');
  const about =
    action.payload.kind === 'stage'
      ? (STAGE_NAME[stage] ?? stage)
      : action.title.replace(/^Rate: /, '');
  if (await on(db, 'stage_rating_request')) {
    if (!g.working) return false;
    return queueCustomerMessage(
      db,
      g.phone,
      'stage_rating_request',
      {
        customer: titleCaseName(g.customer),
        stage: about,
        stageKey: stage,
        project: g.code ?? '',
        ratePayload: `rt:go:${action.id}`,
      },
      `rating_reminder:${action.id}`,
    );
  }
  // The message is switched off: nobody can remind them, so the people who look after it are told.
  await notifyHolders(db, action.payload.kind === 'stage' ? 'projects.manage' : 'service.manage', {
    kind: 'rating_waiting',
    title: `${g.customer} has not rated the ${about}`,
    body: 'The rating message is switched off, so no reminder can go. Ask them on a call.',
    ...(action.projectId ? { subject: { type: 'project' as const, id: action.projectId } } : {}),
    dedupeKey: `rating_waiting:${action.id}`,
  });
  return true;
}

async function payout(db: Database, g: Given): Promise<boolean> {
  const { action } = g;
  if (g.age < DAY || g.age >= 14 * DAY) return false;
  const amountPaise = Number(action.payload.amountPaise ?? 0);
  let worked = false;
  if (g.age >= 2 * DAY) {
    await notifyHolders(db, 'finance.record_payments', {
      kind: 'referral_upi_waiting',
      title: `Still waiting for ${g.customer}'s UPI ID`,
      body: `${formatInr(amountPaise)} reward. Ask them again with Send to customer, or call.`,
      dedupeKey: `upi_waiting:${action.id}`,
    });
    worked = true;
  }
  // Day 1, then every 2 days: round 1 from day 1, round 2 from day 3, ...
  const round = 1 + Math.floor((g.age - DAY) / (2 * DAY));
  if (g.working && (await on(db, 'reward_upi_ask')))
    worked =
      (await queueCustomerMessage(
        db,
        g.phone,
        'reward_upi_ask',
        {
          customer: titleCaseName(g.customer),
          amount: formatInr(amountPaise),
          sharePayload: `up:go:${action.id}`,
        },
        `payout_reminder:${action.id}:${round}`,
      )) || worked;
  return worked;
}

async function fixed(db: Database, g: Given): Promise<boolean> {
  const { action } = g;
  if (g.age < DAY || g.age >= 7 * DAY || !g.working) return false;
  if (!(await on(db, 'problem_fixed_check'))) return false;
  return queueCustomerMessage(
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
  );
}

async function renewal(db: Database, g: Given): Promise<boolean> {
  const { action } = g;
  const endsOn = String(action.payload.endsOn ?? '');
  if (!endsOn) return false;
  const left = daysBetween(todayIn(g.timeZone, g.now), endsOn);
  if (left < 0 || left > AMC_REMIND_DAYS) return false;
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
