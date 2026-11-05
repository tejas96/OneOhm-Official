import { type DatabaseExecutor, products, quotations } from '@oneohm/database';
import { DEFAULT_WARRANTY_POLICY } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { warrantyPolicyOf } from '../after-sales/commissioned-on';
import { plainDate } from '../whatsapp/assistant/plain-date';
import { quoteMoney, rupees } from './quote-money-words';
import { QUOTE_Q_WORDS, type QuoteTopic } from './quote-question-words';
import { quotedSteps } from './quoted-terms';

const kw = (watts: number) => `${Number((watts / 1000).toFixed(2))} kW`;
const named = (p: { brand: string; name: string; wattageWp: number | null } | undefined) =>
  p ? `${p.brand} ${p.name}`.trim() : '';

/**
 * The fixed answer to one quote question, built from the quote's own data (redesign §9): its subsidy and
 * totals, its panel and inverter products, the payment plan it was sent with, the owner's warranty policy
 * and its validity. Null for "Call me" and "Something else", which are answered by a person.
 */
export async function quoteAnswer(
  db: DatabaseExecutor,
  quotationId: string,
  topic: QuoteTopic,
): Promise<string | null> {
  const W = QUOTE_Q_WORDS;
  const [row] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!row) return null;
  if (topic === 'subsidy')
    return row.subsidyPaise > 0
      ? W.subsidy(rupees(row.subsidyPaise), rupees(row.effectivePaise))
      : W.noSubsidy(row.subsidyIneligible ?? '');
  if (topic === 'plan' || topic === 'timeline') {
    const money = quoteMoney(row.totalPaise, row.subsidyPaise, await quotedSteps(db, quotationId));
    return topic === 'plan'
      ? money.line
      : W.timeline(plainDate(row.validUntil), money.first, money.firstWhen);
  }
  const [panel] = await db.select().from(products).where(eq(products.id, row.panelProductId));
  const [inverter] = await db.select().from(products).where(eq(products.id, row.inverterProductId));
  if (topic === 'panels')
    return W.panels(row.moduleCount, kw(row.capacityWp), named(panel), named(inverter));
  if (topic === 'warranty') {
    const policy = await warrantyPolicyOf(db).catch(() => DEFAULT_WARRANTY_POLICY);
    return W.warranty(
      panel?.warrantyYears ?? policy.panel.years,
      policy.panel.performanceYears,
      inverter?.warrantyYears ?? policy.inverter.years,
      policy.workmanship.years,
    );
  }
  return null;
}
