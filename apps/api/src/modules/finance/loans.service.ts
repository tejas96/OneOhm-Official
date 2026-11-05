import { Inject, Injectable } from '@nestjs/common';
import type { ProjectLoan } from '@oneohm/api-contracts';
import {
  lendingPartners,
  loanTranches,
  projectLoans,
  projects,
  type Transaction,
} from '@oneohm/database';
import { loanStatusNews } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { tellLoanNews } from '../journey/loan-news';
import { FinanceService } from '../projects/finance.service';
import { readLoans } from './loan-read';
import { type LoanInput, syncTranches } from './loan-tranches';

export interface DisbursementInput {
  trancheId?: string | null | undefined;
  amountPaise: number;
  receivedOn: string;
  reference?: string | null | undefined;
}

/**
 * Bank finance per project (PRD 3.11, Flow B). The loan record tracks the lender,
 * documents, sanction and tranches; the money itself is the project's bank milestone,
 * so every disbursement is a bank-disbursement payment against it.
 */
@Injectable()
export class LoansService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly finance: FinanceService,
  ) {}

  list(): Promise<ProjectLoan[]> {
    return readLoans(this.db);
  }

  private async one(projectId: string): Promise<ProjectLoan> {
    const [loan] = await readLoans(this.db, [projectId]);
    if (!loan) throw notFound('A loan for that project');
    return loan;
  }

  async save(actor: Actor, projectId: string, input: LoanInput): Promise<ProjectLoan> {
    const current = await this.one(projectId);
    const trancheTotal = input.tranches.reduce((sum, tranche) => sum + tranche.amountPaise, 0);
    if (input.tranches.length > 0 && trancheTotal !== current.bankSharePaise) {
      throw invalid('The tranches must add up to the bank share.', {
        tranches: `They add up to ${formatInr(trancheTotal)}; the bank share is ${formatInr(current.bankSharePaise)}.`,
      });
    }
    if (input.lendingPartnerId) {
      const [partner] = await this.db
        .select({ id: lendingPartners.id })
        .from(lendingPartners)
        .where(eq(lendingPartners.id, input.lendingPartnerId))
        .limit(1);
      if (!partner)
        throw invalid('Pick a lender from the list.', { lendingPartnerId: 'Not found.' });
    }
    await this.db.transaction(async (tx) => {
      const { id: loanId, from } = await upsertLoan(tx, actor, projectId, input);
      await syncTranches(tx, loanId, input.tranches);
      // The bank's decision reaches the customer (when the loan step may message them), once.
      const news = loanStatusNews(from, input.status);
      if (news)
        await tellLoanNews(tx, projectId, news, {
          amountPaise: input.sanctionedPaise ?? current.bankSharePaise,
          key: `loan_news:${loanId}:${news}`,
        });
      await recordAudit(tx, actor.userId, 'loan.saved', 'project', projectId, {
        status: input.status,
        sanctionedPaise: input.sanctionedPaise ?? null,
      });
    });
    return this.one(projectId);
  }

  async recordDisbursement(
    actor: Actor,
    projectId: string,
    input: DisbursementInput,
  ): Promise<ProjectLoan> {
    const loan = await this.one(projectId);
    if (!loan.bankMilestoneId) {
      throw conflict('This project has no bank share in its payment schedule.');
    }
    const tranche = input.trancheId
      ? loan.tranches.find((entry) => entry.id === input.trancheId)
      : undefined;
    if (input.trancheId && !tranche) throw notFound('That tranche');
    if (tranche?.status === 'received') throw conflict('That tranche is already received.');
    if (tranche && tranche.amountPaise !== input.amountPaise) {
      throw invalid('A tranche is received in full.', {
        amountPaise: `This tranche is ${formatInr(tranche.amountPaise)}.`,
      });
    }
    await this.finance.recordPayment(
      actor,
      projectId,
      {
        milestoneId: loan.bankMilestoneId,
        amountPaise: input.amountPaise,
        method: 'bank_disbursement',
        receivedOn: input.receivedOn,
        reference: input.reference ?? null,
      },
      async (tx, paymentId) => {
        if (tranche) {
          await tx
            .update(loanTranches)
            .set({ status: 'received', paymentId })
            .where(eq(loanTranches.id, tranche.id));
        }
        const received = loan.receivedPaise + input.amountPaise;
        const opened = loan.started
          ? null
          : await upsertLoan(tx, actor, projectId, {
              version: null,
              lenderName: loan.lenderName || 'Bank',
              status: 'disbursing',
              documents: [],
              tranches: [],
            });
        const loanId = opened?.id ?? null;
        await tx
          .update(projectLoans)
          .set({
            status: received >= loan.bankSharePaise ? 'disbursed' : 'disbursing',
            updatedAt: new Date(),
          })
          .where(loanId ? eq(projectLoans.id, loanId) : eq(projectLoans.projectId, projectId));
        // The money sent by the bank reaches the customer (when the loan step may message them), once per payment.
        await tellLoanNews(tx, projectId, 'disbursed', {
          amountPaise: input.amountPaise,
          key: `loan_news:${paymentId}:disbursed`,
        });
      },
    );
    return this.one(projectId);
  }
}

/** Creates or updates the loan row, checking the version the person last saw. */
async function upsertLoan(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  input: LoanInput,
): Promise<{ id: string; from: string | null }> {
  const [project] = await tx
    .select({ loan: projects.loan })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project?.loan) throw conflict('This project is not bank-financed.');
  const [existing] = await tx
    .select({ id: projectLoans.id, version: projectLoans.version, status: projectLoans.status })
    .from(projectLoans)
    .where(eq(projectLoans.projectId, projectId))
    .for('update')
    .limit(1);
  // A save must name the version it was made from; one made before the loan existed
  // (version null) is stale once someone else has saved it.
  if (existing ? existing.version !== input.version : input.version !== null) {
    throw conflict('Someone else changed this loan. Reload it and try again.', 'stale');
  }
  const values = {
    lendingPartnerId: input.lendingPartnerId ?? null,
    lenderName: input.lenderName,
    applicationNumber: input.applicationNumber ?? null,
    status: input.status,
    sanctionedPaise: input.sanctionedPaise ?? null,
    sanctionedOn: input.sanctionedOn ?? null,
    documents: input.documents,
    notes: input.notes ?? null,
    updatedByUserId: actor.userId,
    updatedAt: new Date(),
  };
  if (existing) {
    await tx
      .update(projectLoans)
      .set({ ...values, version: existing.version + 1 })
      .where(eq(projectLoans.id, existing.id));
    return { id: existing.id, from: existing.status };
  }
  const [created] = await tx
    .insert(projectLoans)
    .values({ projectId, ...values })
    .returning({ id: projectLoans.id });
  if (!created) throw new Error('Loan insert returned nothing.');
  return { id: created.id, from: null };
}
