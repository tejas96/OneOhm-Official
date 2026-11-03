import type { CustomerLanguage } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { properties } from './schema/crm.schema';
import { paymentMilestones } from './schema/finance.schema';
import { projects } from './schema/projects.schema';

type Payload = Readonly<Record<string, string>>;
type Name = (index: number, count: number) => string;

/**
 * An instalment as the chat names it (live review C9): 1st / 2nd / last instalment. The
 * chat's own words reuse these, so a template and the chat say the same thing.
 */
export const INSTALMENT_NAMES: Readonly<Record<CustomerLanguage, Name>> = {
  'en-IN': (index, count) =>
    index === count - 1 && count > 1
      ? 'Last instalment'
      : `${['1st', '2nd', '3rd'][index] ?? `${index + 1}th`} instalment`,
  'mr-IN': (index, count) =>
    index === count - 1 && count > 1
      ? 'शेवटचा हप्ता'
      : `${['पहिला', 'दुसरा', 'तिसरा'][index] ?? `${index + 1}वा`} हप्ता`,
  'hi-IN': (index, count) =>
    index === count - 1 && count > 1
      ? 'आखिरी किस्त'
      : `${['पहली', 'दूसरी', 'तीसरी'][index] ?? `${index + 1}वीं`} किस्त`,
};

/** The bank's share of the price, paid from the customer's loan. */
export const BANK_SHARE_NAMES: Readonly<Record<CustomerLanguage, string>> = {
  'en-IN': 'Bank loan',
  'mr-IN': 'बँक कर्ज',
  'hi-IN': 'बैंक लोन',
};

export interface Instalment {
  readonly index: number;
  readonly count: number;
  readonly percent: number;
}

/** How the payload carries an instalment for the worker: "1/3/65", or "bank". */
export const instalmentTag = (instalment: Instalment | 'bank') =>
  instalment === 'bank' ? 'bank' : `${instalment.index}/${instalment.count}/${instalment.percent}`;

/** "2nd instalment (65%)" in the language, from the payload's tag; undefined for no tag. */
export function instalmentWords(language: CustomerLanguage, tag: string | undefined) {
  if (tag === 'bank') return BANK_SHARE_NAMES[language];
  const [index, count, percent] = (tag ?? '').split('/').map(Number);
  if (index === undefined || count === undefined || percent === undefined) return undefined;
  if (![index, count, percent].every(Number.isInteger)) return undefined;
  return `${INSTALMENT_NAMES[language](index, count)} (${percent}%)`;
}

/** "Sangli · 3.27 kW": the town and size; the project code only when there is no town. */
export function projectWords(project: { code: string; city: string; capacityWp: number }) {
  const town = project.city.trim();
  const kw = Number((project.capacityWp / 1000).toFixed(2));
  return town ? `${town} · ${kw} kW` : project.code;
}

/**
 * A template's values in the chat's plain words (live QA C9): `project` (the project code
 * every sender puts there) becomes the town and size, and with a `milestoneId` the
 * `milestone` becomes the instalment, with its tag so Marathi and Hindi can say it too.
 */
export async function plainNames(db: DatabaseExecutor, payload: Payload): Promise<Payload> {
  const named: Record<string, string> = { ...payload };
  if (payload.project) {
    const [project] = await db
      .select({ code: projects.code, city: properties.city, capacityWp: projects.capacityWp })
      .from(projects)
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .where(eq(projects.code, payload.project))
      .limit(1);
    if (project) named.project = projectWords(project);
  }
  if (payload.milestoneId) {
    const instalment = await instalmentOf(db, payload.milestoneId);
    if (instalment) {
      named.instalment = instalmentTag(instalment);
      named.milestone = instalmentWords('en-IN', named.instalment) ?? named.milestone ?? '';
    }
  }
  return named;
}

/** A milestone's place among the project's customer shares and its share of them. */
async function instalmentOf(db: DatabaseExecutor, milestoneId: string) {
  const [milestone] = await db
    .select({ projectId: paymentMilestones.projectId, payer: paymentMilestones.payer })
    .from(paymentMilestones)
    .where(eq(paymentMilestones.id, milestoneId))
    .limit(1);
  if (!milestone) return null;
  if (milestone.payer === 'bank') return 'bank' as const;
  const customer = await db
    .select({ id: paymentMilestones.id, amount: paymentMilestones.amountPaise })
    .from(paymentMilestones)
    .where(
      and(
        eq(paymentMilestones.projectId, milestone.projectId),
        eq(paymentMilestones.payer, 'customer'),
      ),
    )
    .orderBy(paymentMilestones.position);
  const index = customer.findIndex((share) => share.id === milestoneId);
  const total = customer.reduce((sum, share) => sum + share.amount, 0);
  if (index < 0 || total <= 0) return null;
  const percent = Math.round(((customer[index]?.amount ?? 0) * 100) / total);
  return { index, count: customer.length, percent };
}
