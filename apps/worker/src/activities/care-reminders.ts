import {
  customerActions,
  customers,
  type Database,
  notifyHolders,
  projects,
  queueCustomerMessage,
  referralRewards,
  routeOfCustomer,
} from '@oneohm/database';
import { isWorkingTime } from '@oneohm/domain';
import { formatInr, titleCaseName, todayIn } from '@oneohm/shared';
import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import { AMC_REMIND_DAYS, DAY, expireRatings, fixed, type Given, on, renewal } from './care-asks';

const PER_TICK = 200;
/** How long each ask is chased, counted per kind in the query, so a stale kind cannot crowd out a fresh one. */
const RATING_DAYS = 14;
const FIXED_DAYS = 7;
const PAYOUT_DAYS = 14;

const STAGE_NAME: Readonly<Record<string, string>> = {
  survey: 'site survey',
  installation: 'installation',
  commissioning: 'switch-on and handover',
};

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
  await expireRatings(db, now);
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const today = todayIn(timeZone, now);
  const horizon = new Date(Date.parse(today) + AMC_REMIND_DAYS * DAY).toISOString().slice(0, 10);
  const kind = sql`${customerActions.payload}->>'kind'`;
  // A payout is chased from its latest ask (the first one or an "Ask again").
  const askedAt = sql`greatest(${customerActions.createdAt}, coalesce((${customerActions.payload}->>'askedAt')::timestamptz, ${customerActions.createdAt}))`;
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
        or(
          and(eq(customerActions.type, 'rating'), gt(customerActions.createdAt, ago(RATING_DAYS))),
          and(eq(customerActions.type, 'payout'), gt(askedAt, ago(PAYOUT_DAYS))),
          and(sql`${kind} = 'problem_fixed'`, gt(customerActions.createdAt, ago(FIXED_DAYS))),
          // The offer is made 30 days before the AMC ends: only the last days before its end count.
          and(
            sql`${kind} = 'amc_renewal'`,
            sql`${customerActions.payload}->>'endsOn' between ${today} and ${horizon}`,
          ),
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
  // Rounds count from the latest ask (the first one or an "Ask again"), not from the first creation.
  const again = Date.parse(String(action.payload.askedAt ?? '')) || 0;
  const asked = Math.max(again, action.createdAt.getTime());
  const age = g.now.getTime() - asked;
  if (age < DAY || age >= 14 * DAY) return false;
  // Nothing is owed any more (paid some other way, turned down): no reminder and no alert.
  const [reward] = await db
    .select({ status: referralRewards.status })
    .from(referralRewards)
    .where(eq(referralRewards.id, String(action.payload.rewardId ?? '')));
  if (reward?.status !== 'approved') return false;
  const amountPaise = Number(action.payload.amountPaise ?? 0);
  let worked = false;
  if (age >= 2 * DAY) {
    await notifyHolders(db, 'finance.record_payments', {
      kind: 'referral_upi_waiting',
      title: `Still waiting for ${g.customer}'s UPI ID`,
      body: `${formatInr(amountPaise)} reward. Ask them again with Send to customer, or call.`,
      dedupeKey: `upi_waiting:${action.id}${again ? `:${again}` : ''}`,
    });
    worked = true;
  }
  // Day 1, then every 2 days: round 1 from day 1, round 2 from day 3, ...
  const round = 1 + Math.floor((age - DAY) / (2 * DAY));
  // A customer off WhatsApp was handed over to the team with the first ask: no chat to remind them in.
  const inChat = (await routeOfCustomer(db, action.customerId)) === 'whatsapp';
  if (inChat && g.working && (await on(db, 'reward_upi_ask')))
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
        `payout_reminder:${action.id}${again ? `:${again}` : ''}:${round}`,
      )) || worked;
  return worked;
}
