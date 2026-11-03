import { type Database, paymentMilestones, payments, projects, properties } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Environment } from '../../../config/environment';
import { payPageUrl } from './pay-buttons';
import { PROJECT_WORDS } from './project-words';
import { ANSWER_WORDS, WORDS } from './words';

type Milestone = typeof paymentMilestones.$inferSelect;

/**
 * Each instalment as the customer reads it (live review C9): "1st instalment",
 * "Last instalment", by its place among the customer's own shares; the bank's is "Bank loan".
 */
export function instalmentNames(milestones: readonly Milestone[]): Map<string, string> {
  const own = milestones.filter((row) => row.payer === 'customer');
  const names = new Map<string, string>();
  for (const row of milestones) {
    const index = own.indexOf(row);
    names.set(
      row.id,
      index < 0 ? PROJECT_WORDS.bankShare : PROJECT_WORDS.instalment(index, own.length),
    );
  }
  return names;
}

/**
 * What is paid and due, project by project, named by town. `withLink` (no Pay now
 * buttons follow) adds our pay page link under each due amount; never the raw gateway
 * link, which our page makes when opened.
 */
export async function paymentsText(
  db: Database,
  env: Environment,
  customerId: string,
  withLink: boolean,
): Promise<string> {
  const own = await db
    .select({ id: projects.id, city: properties.city })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(projects.customerId, customerId));
  if (own.length === 0) return WORDS.noProject;
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
  return own
    .map((project) => {
      const rows = milestones.filter((row) => row.projectId === project.id);
      const names = instalmentNames(rows);
      const lines = rows.map((milestone) => {
        const got = paid
          .filter((row) => row.milestoneId === milestone.id)
          .reduce((sum, row) => sum + row.amount, 0);
        const name = names.get(milestone.id) ?? milestone.label;
        const url = withLink ? payPageUrl(env, customerId, milestone.id) : null;
        return milestoneLine(milestone, name, got, url);
      });
      return [`*${PROJECT_WORDS.projectIn(project.city)}*`, ...lines].join('\n');
    })
    .join('\n\n');
}

/** One line per instalment: paid, later, the bank's share, or due (with a pay link). */
function milestoneLine(milestone: Milestone, name: string, got: number, url: string | null) {
  const left = milestone.amountPaise - got;
  if (left <= 0) return ANSWER_WORDS.paid(name, formatInr(milestone.amountPaise));
  if (milestone.payer === 'bank') return ANSWER_WORDS.bank(name, formatInr(left));
  if (milestone.status !== 'due' && milestone.status !== 'partly_paid')
    return ANSWER_WORDS.later(name, formatInr(left));
  return `${ANSWER_WORDS.due(name, formatInr(left))}${url ? `\n  ${WORDS.payHere}: ${url}` : ''}`;
}
