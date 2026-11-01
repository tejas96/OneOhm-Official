import {
  lendingPartners,
  loanTranches,
  paymentMilestones,
  projectLoans,
  type Transaction,
} from '@oneohm/database';
import { patternFor, planTranches } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { invalid } from '../../common/http/errors';
import type { Database } from '../../config/core.module';

export type LoanPartner = typeof lendingPartners.$inferSelect;

/**
 * The listed lender a new loan project names (PRD 7.2), checked before anything is
 * written. Null when the project has no loan or the lender was typed in by hand.
 */
export async function loadLoanPartner(
  db: Database,
  input: { readonly loan: boolean; readonly lendingPartnerId?: string | null | undefined },
): Promise<LoanPartner | null> {
  if (!input.loan || !input.lendingPartnerId) return null;
  const [partner] = await db
    .select()
    .from(lendingPartners)
    .where(eq(lendingPartners.id, input.lendingPartnerId))
    .limit(1);
  if (!partner?.active)
    throw invalid('Pick a lender from the list.', {
      lendingPartnerId: 'That lender is not in use. Pick another or type the name.',
    });
  return partner;
}

/**
 * Opens the project's loan the day it is created: the lender's documents to collect and
 * the bank's share planned in the lender's parts. Runs after the payment milestones
 * exist, since the bank's share is the bank milestone; without one, no tranches.
 */
export async function setUpProjectLoan(
  tx: Transaction,
  projectId: string,
  partner: LoanPartner,
  userId: string,
): Promise<void> {
  const [loan] = await tx
    .insert(projectLoans)
    .values({
      projectId,
      lendingPartnerId: partner.id,
      lenderName: partner.name,
      status: 'collecting_documents',
      documents: partner.requiredDocuments.map((name) => ({ name, received: false })),
      updatedByUserId: userId,
    })
    .returning({ id: projectLoans.id });
  if (!loan) throw new Error('Loan insert returned nothing.');

  const bank = await tx
    .select({ amountPaise: paymentMilestones.amountPaise })
    .from(paymentMilestones)
    .where(and(eq(paymentMilestones.projectId, projectId), eq(paymentMilestones.payer, 'bank')));
  const bankSharePaise = bank.reduce((sum, milestone) => sum + milestone.amountPaise, 0);
  const planned = planTranches(
    bankSharePaise,
    patternFor(partner.disbursement, partner.tranchePattern),
  );
  if (planned.length > 0) {
    await tx.insert(loanTranches).values(
      planned.map((tranche, position) => ({
        loanId: loan.id,
        label: tranche.label,
        amountPaise: tranche.amountPaise,
        position,
      })),
    );
  }
  await recordAudit(tx, userId, 'loan.opened', 'project', projectId, {
    lendingPartnerId: partner.id,
    tranches: planned.length,
    bankSharePaise,
  });
}
