import { type DatabaseExecutor, paymentPlans, quotations } from '@oneohm/database';
import { DEFAULT_MILESTONES, type MilestoneShare } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { planSteps } from '../payment-plans/payment-plans.service';

/** The payment terms a quotation showed the customer: which plan, and its steps then. */
export interface QuotedTerms {
  readonly planId: string | null;
  readonly steps: readonly MilestoneShare[];
}

type Snapshot = Record<string, unknown>;

/** The terms saved on a quotation, or null when it was never sent or accepted. */
export function readQuotedTerms(snapshot: unknown): QuotedTerms | null {
  const terms = (snapshot as Snapshot | null)?.paymentTerms as QuotedTerms | undefined;
  return terms && Array.isArray(terms.steps) ? terms : null;
}

/** The snapshot with these terms, unless it already has terms the customer saw. */
export function withQuotedTerms(snapshot: unknown, terms: QuotedTerms): Snapshot {
  const current = (snapshot as Snapshot | null) ?? {};
  return readQuotedTerms(current) ? current : { ...current, paymentTerms: terms };
}

/**
 * Saves today's default terms on the quotation the first time it goes to the customer
 * (sent or accepted). From then on its PDF, messages and project use these terms, even
 * if the owner changes the default plan later.
 */
export async function freezeQuotedTerms(db: DatabaseExecutor, quotationId: string) {
  const [row] = await db
    .select({ snapshot: quotations.snapshot })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  if (!row || readQuotedTerms(row.snapshot)) return;
  const [plan] = await db
    .select({ id: paymentPlans.id, steps: paymentPlans.steps })
    .from(paymentPlans)
    .where(and(eq(paymentPlans.isDefault, true), eq(paymentPlans.active, true)))
    .limit(1);
  const terms: QuotedTerms = {
    planId: plan?.id ?? null,
    steps: (plan?.steps as MilestoneShare[] | undefined) ?? DEFAULT_MILESTONES,
  };
  await db
    .update(quotations)
    .set({ snapshot: withQuotedTerms(row.snapshot, terms) })
    .where(eq(quotations.id, quotationId));
}

/** The steps a quotation shows: its saved terms, or today's default for a draft. */
export async function quotedSteps(
  db: DatabaseExecutor,
  quotationId: string,
): Promise<readonly MilestoneShare[]> {
  const [row] = await db
    .select({ snapshot: quotations.snapshot })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  return readQuotedTerms(row?.snapshot)?.steps ?? planSteps(db, null);
}
