import { type Database, paymentMilestones, payments, projects, properties } from '@oneohm/database';
import type { MilestoneTrigger } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq, inArray } from 'drizzle-orm';
import { activeProjectsOf } from '../../customer-portal/active-projects';
import { QUOTE_MONEY_WORDS } from '../../quotations/quote-money-words';
import { ANSWER_WORDS } from './words';

type Milestone = typeof paymentMilestones.$inferSelect;

/** One home's money: the text, and the first amount due now (its Pay ₹X button). */
export interface HomePayments {
  readonly body: string;
  readonly due: { readonly milestoneId: string; readonly leftPaise: number } | null;
}

/**
 * What is paid and due, one block per home (redesign §10): "*Sangli solar* — ₹1,20,000
 * total", then ✅ paid · 🔴 due now · ⚪ later (by when it falls due) lines. Never a raw
 * gateway link: the Pay ₹X tap answers with our pay page.
 */
export async function paymentsText(db: Database, customerId: string): Promise<HomePayments[]> {
  const own = await db
    .select({ id: projects.id, city: properties.city, label: properties.label })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(activeProjectsOf(customerId));
  if (own.length === 0) return [];
  const ids = own.map((project) => project.id);
  const milestones = await db
    .select()
    .from(paymentMilestones)
    .where(inArray(paymentMilestones.projectId, ids))
    .orderBy(paymentMilestones.position);
  const paid = await db
    .select({ milestoneId: payments.milestoneId, amount: payments.amountPaise })
    .from(payments)
    .where(inArray(payments.projectId, ids));
  return own.map((project) => {
    const rows = milestones.filter((row) => row.projectId === project.id);
    const left = (row: Milestone) =>
      row.amountPaise -
      paid.filter((pay) => pay.milestoneId === row.id).reduce((sum, pay) => sum + pay.amount, 0);
    const total = rows.reduce((sum, row) => sum + row.amountPaise, 0);
    const home = project.label?.trim() || project.city;
    const lines = rows.map((row) => milestoneLine(row, left(row)));
    const first = rows.find((row) => isDue(row) && row.payer === 'customer' && left(row) > 0);
    return {
      body: [ANSWER_WORDS.total(home, formatInr(total)), ...lines].join('\n'),
      due: first ? { milestoneId: first.id, leftPaise: left(first) } : null,
    };
  });
}

const isDue = (row: Milestone) => row.status === 'due' || row.status === 'partly_paid';

/** One line per instalment: paid, due now, the bank's share, or when it falls due. */
function milestoneLine(milestone: Milestone, left: number) {
  if (left <= 0) return ANSWER_WORDS.paid(formatInr(milestone.amountPaise));
  if (milestone.payer === 'bank') return ANSWER_WORDS.bank(formatInr(left));
  if (!isDue(milestone)) {
    const when = QUOTE_MONEY_WORDS.when[milestone.trigger as MilestoneTrigger] ?? '';
    return ANSWER_WORDS.later(formatInr(left), when);
  }
  return ANSWER_WORDS.due(formatInr(left));
}
