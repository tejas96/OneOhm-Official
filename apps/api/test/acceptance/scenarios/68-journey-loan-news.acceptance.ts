import type { ProjectLoan } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { logLines, saveLoan, setNotify, setTemplate } from '../support/journey-steps';
import { lastReply, replies } from '../support/onboarding';
import { sellProject, today } from '../support/sales';
import { closeChat, openChat } from '../support/send';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// Loan status messages (redesign §4 Loan): sanctioned, money sent, not approved. Only when the loan step
// may message the customer (PRD rule) and the message's template is switched on; off by default.

const BANK = 'HDFC Bank (test)';

describe('Journey: loan news', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const loanSale = (name: string) => sellProject(admin, { name, loan: true });
  const save = (sale: Awaited<ReturnType<typeof loanSale>>, status: string, over = {}) =>
    saveLoan(admin, sale, { status, sanctionedPaise: 10_000_000, sanctionedOn: today(), ...over });
  const queued = (phone: string, key: string) =>
    outboxFor(phone).then((sent) => sent.filter((row) => row.template === key));

  it('sanctioned: only the template is queued while it is off; the chat says it once it is on', async () => {
    const off = await loanSale('Loan News Off (test)');
    await openChat(off.customer.phone, off.customer.customerId);
    await save(off, 'sanctioned');
    expect(await replies(off.customer.phone)).toHaveLength(0);
    const [row] = await queued(off.customer.phone, 'loan_sanctioned');
    expect(row?.payload).toMatchObject({ bank: BANK, amount: '₹1,00,000' });
    // The log says it was not sent: a switched-off template tells nobody.
    const [offLine] = await logLines(off.project.id, 'Told the customer the loan%');
    expect(offLine?.message).toMatch(/\(not sent: the message is switched off\)$/);

    const restore = await setTemplate('loan_sanctioned', true);
    try {
      const on = await loanSale('Loan News On (test)');
      await openChat(on.customer.phone, on.customer.customerId);
      await save(on, 'submitted');
      expect(await replies(on.customer.phone)).toHaveLength(0);
      await save(on, 'sanctioned');
      expect((await lastReply(on.customer.phone))?.body).toBe(
        `Good news: your loan of *₹1,00,000* is sanctioned by ${BANK}.`,
      );
      expect(await queued(on.customer.phone, 'loan_sanctioned')).toHaveLength(0);
      const [line] = await logLines(on.project.id, 'Told the customer the loan%');
      expect(line?.message).toBe(
        `Told the customer the loan of ₹1,00,000 is sanctioned by ${BANK} on WhatsApp`,
      );
      // Saved again with the same status: nothing more is said.
      await save(on, 'sanctioned', { notes: 'Again (test)' });
      expect(await replies(on.customer.phone)).toHaveLength(1);
      // The window closed: the approved template goes with its details.
      const shut = await loanSale('Loan News Shut (test)');
      await closeChat(shut.customer.phone);
      await save(shut, 'sanctioned');
      expect((await queued(shut.customer.phone, 'loan_sanctioned'))[0]?.payload).toMatchObject({
        bank: BANK,
      });
    } finally {
      await restore();
    }
  });

  it('each disbursement says how much the bank sent', async () => {
    const restore = await setTemplate('loan_disbursed', true);
    try {
      const sale = await loanSale('Loan Disbursed (test)');
      await openChat(sale.customer.phone, sale.customer.customerId);
      await save(sale, 'sanctioned', {
        tranches: [
          { label: 'First (test)', amountPaise: 6_000_000 },
          { label: 'Second (test)', amountPaise: 4_000_000 },
        ],
      });
      const accounts = await Session.password(staffEmail('accounts'), TEAM_PASSWORD);
      const loans = await accounts.get<ProjectLoan[]>('/finance/loans');
      const [first] = loans.find((one) => one.projectId === sale.project.id)?.tranches ?? [];
      await accounts.post(`/finance/loans/${sale.project.id}/disbursements`, {
        trancheId: first?.id,
        amountPaise: 6_000_000,
        receivedOn: today(),
        reference: 'UTR-news (test)',
      });
      expect((await lastReply(sale.customer.phone))?.body).toBe(
        `*₹60,000* was sent by ${BANK} for your solar.`,
      );
    } finally {
      await restore();
    }
  });

  it('not approved: the customer is told a person will call, and a call alert is made', async () => {
    const restore = await setTemplate('loan_rejected', true);
    try {
      const sale = await loanSale('Loan Rejected (test)');
      await openChat(sale.customer.phone, sale.customer.customerId);
      await save(sale, 'submitted');
      await save(sale, 'rejected');
      expect((await lastReply(sale.customer.phone))?.body).toMatch(
        new RegExp(
          `^${BANK.replace(/[()]/g, '\\$&')} did not approve the loan\\. .+ will call you to plan the next steps\\.$`,
        ),
      );
      const [alert] = await rows<{ title: string }>(
        "SELECT title FROM notifications WHERE kind = 'loan_rejected' AND title LIKE $1",
        [`%Loan Rejected (test)%`],
      );
      expect(alert?.title).toMatch(/did not approve the loan$/);
    } finally {
      await restore();
    }
  });

  it('a loan step that may not message customers says nothing (PRD rule)', async () => {
    const restore = await setTemplate('loan_sanctioned', true);
    try {
      const sale = await loanSale('Loan News Quiet (test)');
      await setNotify(sale, 'loan_approval', false);
      await openChat(sale.customer.phone, sale.customer.customerId);
      await save(sale, 'sanctioned');
      expect(await replies(sale.customer.phone)).toHaveLength(0);
      expect(await queued(sale.customer.phone, 'loan_sanctioned')).toHaveLength(0);
    } finally {
      await restore();
    }
  });
});
