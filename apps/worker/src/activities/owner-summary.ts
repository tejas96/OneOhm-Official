import {
  type Database,
  leads,
  notifyHolders,
  paymentMilestones,
  payments,
  projects,
  projectTasks,
  quotations,
} from '@oneohm/database';
import { addDays, formatInrCompact } from '@oneohm/shared';
import { and, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';

export interface PeriodNumbers {
  readonly receivedPaise: number;
  readonly newLeads: number;
  readonly quotesSent: number;
  readonly quotesAccepted: number;
  readonly projectsStarted: number;
  readonly tasksDone: number;
  readonly overdueNow: number;
  readonly dueUnpaidPaise: number;
}

const count = sql<number>`count(*)::int`;
/** Midnight in India for a business date. */
const start = (date: string) => new Date(`${date}T00:00:00+05:30`);

/** What happened from `from` up to (not including) `to`, and what is open right now. */
export async function periodNumbers(
  db: Database,
  from: string,
  to: string,
  today: string,
): Promise<PeriodNumbers> {
  const [money] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint` })
    .from(payments)
    .where(and(gte(payments.receivedOn, from), lt(payments.receivedOn, to)));
  const [newLeads] = await db
    .select({ n: count })
    .from(leads)
    .where(and(gte(leads.createdAt, start(from)), lt(leads.createdAt, start(to))));
  const [sent] = await db
    .select({ n: count })
    .from(quotations)
    .where(and(gte(quotations.sentAt, start(from)), lt(quotations.sentAt, start(to))));
  const [accepted] = await db
    .select({ n: count })
    .from(quotations)
    .where(and(gte(quotations.acceptedAt, start(from)), lt(quotations.acceptedAt, start(to))));
  const [started] = await db
    .select({ n: count })
    .from(projects)
    .where(and(gte(projects.createdAt, start(from)), lt(projects.createdAt, start(to))));
  const [done] = await db
    .select({ n: count })
    .from(projectTasks)
    .where(
      and(gte(projectTasks.completedAt, start(from)), lt(projectTasks.completedAt, start(to))),
    );
  const [overdue] = await db
    .select({ n: count })
    .from(projectTasks)
    .where(and(ne(projectTasks.status, 'completed'), lt(projectTasks.dueDate, today)));
  const [due] = await db
    .select({
      total: sql<number>`coalesce(sum(${paymentMilestones.amountPaise} - coalesce((select sum(p.amount_paise) from payments p where p.milestone_id = ${paymentMilestones.id}), 0)), 0)::bigint`,
    })
    .from(paymentMilestones)
    .where(
      and(
        eq(paymentMilestones.payer, 'customer'),
        inArray(paymentMilestones.status, ['due', 'partly_paid']),
      ),
    );
  return {
    receivedPaise: Number(money?.total ?? 0),
    newLeads: newLeads?.n ?? 0,
    quotesSent: sent?.n ?? 0,
    quotesAccepted: accepted?.n ?? 0,
    projectsStarted: started?.n ?? 0,
    tasksDone: done?.n ?? 0,
    overdueNow: overdue?.n ?? 0,
    dueUnpaidPaise: Number(due?.total ?? 0),
  };
}

/** One line an owner can read in five seconds. */
export function summaryLine(numbers: PeriodNumbers): string {
  return [
    `${formatInrCompact(numbers.receivedPaise)} received`,
    `${numbers.newLeads} new leads`,
    `${numbers.quotesSent} quotes sent, ${numbers.quotesAccepted} accepted`,
    `${numbers.projectsStarted} projects started`,
    `${numbers.tasksDone} tasks done`,
    `${numbers.overdueNow} late now`,
    `${formatInrCompact(numbers.dueUnpaidPaise)} still due from customers`,
  ].join(' · ');
}

/**
 * Each morning, the people who see every project get yesterday in one line; on Mondays
 * also the last seven days (PRD 3.1). Alerts reach the app inbox and phones.
 */
export async function queueOwnerSummaries(db: Database, today: string): Promise<number> {
  const yesterday = addDays(today, -1);
  const daily = await periodNumbers(db, yesterday, today, today);
  let sent = await notifyHolders(db, 'projects.view_all', {
    kind: 'owner_daily',
    title: 'Yesterday at OneOhm',
    body: summaryLine(daily),
    dedupeKey: `owner_daily:${today}`,
  });
  const monday = new Date(`${today}T12:00:00+05:30`).getUTCDay() === 1;
  if (monday) {
    const weekly = await periodNumbers(db, addDays(today, -7), today, today);
    sent += await notifyHolders(db, 'projects.view_all', {
      kind: 'owner_weekly',
      title: 'Last week at OneOhm',
      body: summaryLine(weekly),
      dedupeKey: `owner_weekly:${today}`,
    });
  }
  return sent;
}
