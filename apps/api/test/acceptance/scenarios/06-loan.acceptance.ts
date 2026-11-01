import type {
  ProjectDetail,
  ProjectLoan,
  Receivable,
  ReceivedPayment,
} from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { expectBalanced, milestoneOf, postings } from '../support/money';
import { type Sale, sellProject, today } from '../support/sales';
import { completeThrough, project } from '../support/tasks';
import { STAFF, staffEmail, TEAM_PASSWORD } from '../support/team';

// PRD 13 "Loan handling": loan tasks and bank receivables appear only when a loan is
// selected; disbursements reconcile.
const LOAN_TASKS = [
  'loan_documents',
  'loan_submission',
  'loan_approval',
  'loan_disbursement_claim',
];
const LOAN = 10_000_000; // ₹1,00,000 from the bank
const FIRST = 6_000_000;
const SECOND = LOAN - FIRST;

describe('Loan handling', () => {
  let admin: Session;
  let accounts: Session;
  let loanDesk: Session;
  let withLoan: Sale;
  let cash: Sale;

  beforeAll(async () => {
    admin = await Session.admin();
    accounts = await Session.password(staffEmail('accounts'), TEAM_PASSWORD);
    loanDesk = await Session.code(STAFF.loan.phone);
    withLoan = await sellProject(admin, {
      name: 'Loan Customer (test)',
      loan: true,
      loanPaise: LOAN,
    });
    cash = await sellProject(admin, { name: 'Cash Customer (test)' });
  });
  afterAll(closeDb);

  const loanOf = async (detail: ProjectDetail) => {
    const loans = await accounts.get<ProjectLoan[]>('/finance/loans');
    return loans.find((loan) => loan.projectId === detail.id);
  };

  it('adds the loan tasks, given to the loan desk, only when a loan is selected', () => {
    const keys = (detail: ProjectDetail) => detail.tasks.map((task) => task.templateKey);
    expect(keys(withLoan.project)).toEqual(expect.arrayContaining(LOAN_TASKS));
    expect(keys(cash.project).filter((key) => LOAN_TASKS.includes(key))).toEqual([]);
    for (const task of withLoan.project.tasks.filter((t) => LOAN_TASKS.includes(t.templateKey))) {
      expect(task.assignee?.fullName, task.templateKey).toBe(STAFF.loan.name);
    }
  });

  it('splits the price into a bank receivable and the customer’s own share', () => {
    const bank = withLoan.project.milestones.filter((m) => m.payer === 'bank');
    expect(bank).toHaveLength(1);
    expect(bank[0]?.amountPaise).toBe(LOAN);
    expect(bank[0]?.trigger).toBe('loan_disbursement');
    const sum = (detail: ProjectDetail) =>
      detail.milestones.reduce((total, milestone) => total + milestone.amountPaise, 0);
    expect(sum(withLoan.project)).toBe(withLoan.quotation.totalPaise);
    expect(cash.project.milestones.some((m) => m.payer === 'bank')).toBe(false);
    expect(sum(cash.project)).toBe(cash.quotation.totalPaise);
  });

  it('lists the bank share for finance only on the loan project', async () => {
    const loan = await loanOf(withLoan.project);
    expect(loan?.bankSharePaise).toBe(LOAN);
    expect(loan?.receivedPaise).toBe(0);
    expect(await loanOf(cash.project)).toBeUndefined();
    const receivables = await accounts.get<Receivable[]>('/finance/receivables');
    const bank = receivables.filter((row) => row.payer === 'bank');
    expect(bank.some((row) => row.projectId === withLoan.project.id)).toBe(true);
    expect(bank.some((row) => row.projectId === cash.project.id)).toBe(false);
  });

  it('records the sanction with two tranches on the loan desk', async () => {
    const loan = await loanOf(withLoan.project);
    const saved = await loanDesk.put<ProjectLoan>(`/finance/loans/${withLoan.project.id}`, {
      version: loan?.version ?? null,
      lenderName: 'State Bank of India (test)',
      applicationNumber: 'SBI-APP-001 (test)',
      status: 'sanctioned',
      sanctionedPaise: LOAN,
      sanctionedOn: today(),
      documents: [{ name: 'Sanction letter (test)', received: true }],
      tranches: [
        { label: 'First tranche (test)', amountPaise: FIRST },
        { label: 'Second tranche (test)', amountPaise: SECOND },
      ],
    });
    expect(saved.status).toBe('sanctioned');
    expect(saved.tranches.map((tranche) => tranche.amountPaise)).toEqual([FIRST, SECOND]);
  });

  it('makes the bank share due when the disbursement claim task is done', async () => {
    await completeThrough(admin, withLoan.project.id, 'loan_disbursement_claim');
    const detail = await project(admin, withLoan.project.id);
    expect(milestoneOf(detail, 'loan_disbursement').status).toBe('due');
    const loan = await loanOf(detail);
    expect(loan?.readyToClaim).toBe(true);
    const receivables = await accounts.get<Receivable[]>('/finance/receivables');
    const row = receivables.find((r) => r.projectId === detail.id && r.payer === 'bank');
    expect(row?.nextAction).toBe('claim_from_bank');
  });

  it('refuses to book the bank share as customer money', async () => {
    const detail = await project(admin, withLoan.project.id);
    const bank = milestoneOf(detail, 'loan_disbursement');
    const reply = await accounts.raw('POST', `/projects/${detail.id}/payments`, {
      milestoneId: bank.id,
      amountPaise: FIRST,
      method: 'upi',
      receivedOn: today(),
    });
    expect(reply.status).toBe(400);
  });

  it('reconciles each disbursement against the bank milestone', async () => {
    const before = await loanOf(withLoan.project);
    const [first, second] = before?.tranches ?? [];
    const afterFirst = await accounts.post<ProjectLoan>(
      `/finance/loans/${withLoan.project.id}/disbursements`,
      { trancheId: first?.id, amountPaise: FIRST, receivedOn: today(), reference: 'UTR-1 (test)' },
    );
    expect(afterFirst.receivedPaise).toBe(FIRST);
    expect(afterFirst.status).toBe('disbursing');
    let bank = milestoneOf(await project(admin, withLoan.project.id), 'loan_disbursement');
    expect(bank.status).toBe('partly_paid');
    expect(bank.paidPaise).toBe(FIRST);

    // More than the bank still owes is refused: the books never show an overpaid loan.
    const over = await accounts.raw('POST', `/finance/loans/${withLoan.project.id}/disbursements`, {
      amountPaise: SECOND + 1,
      receivedOn: today(),
    });
    expect(over.status).toBe(400);

    const done = await accounts.post<ProjectLoan>(
      `/finance/loans/${withLoan.project.id}/disbursements`,
      {
        trancheId: second?.id,
        amountPaise: SECOND,
        receivedOn: today(),
        reference: 'UTR-2 (test)',
      },
    );
    expect(done.receivedPaise).toBe(LOAN);
    expect(done.status).toBe('disbursed');
    expect(done.tranches.every((tranche) => tranche.status === 'received')).toBe(true);
    bank = milestoneOf(await project(admin, withLoan.project.id), 'loan_disbursement');
    expect(bank.status).toBe('paid');
    expect(bank.paidPaise).toBe(LOAN);
  });

  it('shows the disbursements as bank receipts in the books, with nothing left to claim', async () => {
    const payments = await accounts.get<ReceivedPayment[]>('/finance/payments?limit=500');
    const mine = payments.filter((p) => p.projectId === withLoan.project.id && p.payer === 'bank');
    expect(mine.map((p) => p.amountPaise).sort()).toEqual([FIRST, SECOND].sort());
    expect(mine.every((p) => p.method === 'bank_disbursement' && p.receiptNumber)).toBe(true);
    for (const payment of mine) expect(await postings('payment', payment.id)).toBe(1);
    const receivables = await accounts.get<Receivable[]>('/finance/receivables');
    expect(receivables.some((r) => r.projectId === withLoan.project.id && r.payer === 'bank')).toBe(
      false,
    );
    await expectBalanced(accounts);
  });
});
