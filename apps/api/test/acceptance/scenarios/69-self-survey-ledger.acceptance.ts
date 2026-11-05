import type { QuotationDetail } from '@oneohm/api-contracts';
import { postMilestoneDue } from '@oneohm/database';
import { buildTaxInvoice, discountTaxPaise, ratesOf } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadInvoiceSource } from '../../../src/modules/finance/invoice-source';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { milestoneOf, recordPayment } from '../support/money';
import { sellProject } from '../support/sales';
import { credits, instalments, offerSurvey, sendWholeSurvey } from '../support/self-survey';
import { completeThrough, project, surveyFacts, taskByKey, workTask } from '../support/tasks';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// The discount in the books (redesign §7): the GST of the milestones adds up to the invoice's GST exactly,
// and a credit that had nowhere to go lands on the instalment that falls due next.

describe('Self survey: the discount in the ledger', () => {
  let admin: Session;
  let accounts: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    accounts = await Session.password(staffEmail('accounts'), TEAM_PASSWORD);
  });
  afterAll(closeDb);

  async function received(name: string) {
    const sale = await sellProject(admin, { name });
    const { ask } = await offerSurvey(admin, sale);
    await sendWholeSurvey(sale.customer.phone, sale, ask.id);
    return sale;
  }
  const approve = async (projectId: string, meters?: (base: number) => number) => {
    const detail = await project(admin, projectId);
    const task = taskByKey(detail, 'site_survey');
    const base = await surveyFacts(admin, detail, task);
    const facts = meters
      ? {
          dc_cable_meters: String(meters(Number(base.dc_cable_meters))),
          ac_cable_meters: String(meters(Number(base.ac_cable_meters))),
        }
      : base;
    return workTask(admin, task, { facts });
  };
  const gstOf = async (milestoneId: string) =>
    Number(
      (
        await rows<{ gst: string }>(
          `SELECT coalesce(sum(l.credit_paise), 0) AS gst FROM journal_lines l
             JOIN journal_entries e ON e.id = l.entry_id
            WHERE e.source_type = 'milestone_due' AND e.source_id = $1 AND l.account_code = '2200'`,
          [milestoneId],
        )
      )[0]?.gst ?? 0,
    );
  const receivable = async (milestoneId: string) =>
    Number(
      (
        await rows<{ debit: string }>(
          `SELECT coalesce(sum(l.debit_paise), 0) AS debit FROM journal_lines l
             JOIN journal_entries e ON e.id = l.entry_id
            WHERE e.source_type = 'milestone_due' AND e.source_id = $1`,
          [milestoneId],
        )
      )[0]?.debit ?? 0,
    );

  it('every instalment carries its share of the GST left after the discount, and the total is the invoice GST exactly', async () => {
    const sale = await received('Survey Ledger (test)');
    await approve(sale.project.id);
    const quote = await admin.get<QuotationDetail>(`/quotations/${sale.quotation.id}`);
    const discountTax = discountTaxPaise(
      ratesOf(quote.lines.filter((l) => l.extraKind !== 'optional')),
      100_000,
    );
    const db = acceptanceDb().db;
    // Let every instalment fall due in order, as they do over a project.
    for (const one of await instalments(sale.project.id)) {
      await rows(
        "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE id = $1 AND due_at IS NULL",
        [one.id],
      );
      await db.transaction((tx) => postMilestoneDue(tx, one.id, admin.userId));
    }
    const all = await instalments(sale.project.id);
    const gst = await Promise.all(all.map((one) => gstOf(one.id)));
    expect(gst.reduce((sum, one) => sum + one, 0)).toBe(quote.totals.taxPaise - discountTax);
    // The invoice: the quotation lines and the discount lines add to the same GST, and its total is the schedule.
    const source = await loadInvoiceSource(db, sale.project.id);
    const invoice = buildTaxInvoice(source.lines, 'intra_state');
    expect(invoice.totals.taxPaise).toBe(gst.reduce((sum, one) => sum + one, 0));
    expect(invoice.totals.totalPaise).toBe(source.scheduleTotalPaise);
  });

  async function pendingThenDispatch(name: string, shrink?: number) {
    const sale = await received(name);
    const { project: made } = sale;
    const detail = await project(admin, made.id);
    await recordPayment(
      accounts,
      made.id,
      milestoneOf(detail, 'quotation_accepted'),
      'bank_transfer',
    );
    const dispatch = milestoneOf(detail, 'material_dispatch');
    const final = milestoneOf(detail, 'commissioning_completed');
    if (shrink)
      await rows('UPDATE payment_milestones SET amount_paise = $2 WHERE id = $1', [
        dispatch.id,
        shrink,
      ]);
    // An advance against the upcoming dispatch payment makes it partly paid: it cannot take the discount.
    if (!shrink)
      await recordPayment(accounts, made.id, { ...dispatch, paidPaise: 0 }, 'upi', {
        amountPaise: 500_000,
      });
    await rows("UPDATE payment_milestones SET status = 'due', due_at = now() WHERE id = $1", [
      final.id,
    ]);
    await approve(made.id);
    expect((await credits(made.id))[0]).toMatchObject({ status: 'pending', milestone_id: null });
    return { sale, dispatch, final };
  }
  const alerts = (projectId: string) =>
    rows<{ read_at: Date | null }>(
      "SELECT read_at FROM notifications WHERE kind = 'credit_pending' AND project_id = $1",
      [projectId],
    );

  it('a pending credit lands on the instalment that falls due next; reversing the advance changes nothing', async () => {
    const { sale, dispatch } = await pendingThenDispatch('Survey Dispatch (test)');
    const { project: made, customer } = sale;
    const before = (await alerts(made.id)).length;
    expect(before).toBeGreaterThan(0);
    // The advance is reversed: the instalment is upcoming again, the credit still waits, no amount moved.
    const [advance] = await rows<{ id: string }>(
      'SELECT id FROM payments WHERE milestone_id = $1 AND reverses_payment_id IS NULL',
      [dispatch.id],
    );
    await admin.post(`/finance/payments/${advance?.id}/reverse`, {
      reason: 'Wrong instalment (test)',
    });
    const [after] = await rows<{ status: string; amount: number }>(
      'SELECT status::text AS status, amount_paise::bigint::int AS amount FROM payment_milestones WHERE id = $1',
      [dispatch.id],
    );
    expect(after).toMatchObject({ status: 'upcoming', amount: dispatch.amountPaise });
    expect((await credits(made.id))[0]?.status).toBe('pending');
    // The dispatch step is really completed: the credit goes on that instalment, which falls due reduced.
    await completeThrough(admin, made.id, 'dispatch_material');
    const [due] = await rows<{ status: string; amount: number; due_at: Date | null }>(
      'SELECT status::text AS status, amount_paise::bigint::int AS amount, due_at FROM payment_milestones WHERE id = $1',
      [dispatch.id],
    );
    expect(due).toMatchObject({ amount: dispatch.amountPaise - 100_000 });
    expect(['due', 'partly_paid', 'paid']).toContain(due?.status);
    expect(due?.due_at).not.toBeNull();
    expect((await credits(made.id))[0]).toMatchObject({
      status: 'applied',
      milestone_id: dispatch.id,
    });
    expect(await receivable(dispatch.id)).toBe(dispatch.amountPaise - 100_000);
    // The last instalment to fall due takes the GST that is left, so all of them add up to the quotation GST
    // less the discount's GST exactly.
    const quote = await admin.get<QuotationDetail>(`/quotations/${sale.quotation.id}`);
    const left =
      quote.totals.taxPaise -
      discountTaxPaise(ratesOf(quote.lines.filter((l) => l.extraKind !== 'optional')), 100_000);
    const all = await instalments(made.id);
    const booked = await Promise.all(all.map((one) => gstOf(one.id)));
    expect(booked.reduce((sum, one) => sum + one, 0)).toBe(left);
    // The customer's due notice shows the reduced amount; the audit and the alert are in order.
    const said = (await outboxFor(customer.phone))
      .map((row) => JSON.stringify(row.payload))
      .join(' ');
    expect(said).toContain(formatInr(dispatch.amountPaise - 100_000).replace('₹', ''));
    expect(
      await rows(
        "SELECT 1 FROM audit_log WHERE action = 'milestone_credit.applied' AND data->>'milestoneId' = $1",
        [dispatch.id],
      ),
    ).toHaveLength(1);
    const alertsNow = await alerts(made.id);
    expect(alertsNow).toHaveLength(before);
    expect(alertsNow.every((one) => one.read_at !== null)).toBe(true);
  });

  it('an instalment of ₹1,000 or less cannot take it: the credit stays pending', async () => {
    const { sale, dispatch } = await pendingThenDispatch('Survey Small (test)', 90_000);
    await rows("UPDATE payment_milestones SET status = 'upcoming', due_at = NULL WHERE id = $1", [
      dispatch.id,
    ]);
    await completeThrough(admin, sale.project.id, 'dispatch_material');
    const [due] = await rows<{ amount: number }>(
      'SELECT amount_paise::bigint::int AS amount FROM payment_milestones WHERE id = $1',
      [dispatch.id],
    );
    expect(due?.amount).toBe(90_000);
    expect((await credits(sale.project.id))[0]).toMatchObject({ status: 'pending' });
  });

  it('a revision the customer accepts gives a pending credit the final payment it now fits on', async () => {
    const sale = await received('Survey Revision (test)');
    const { project: made } = sale;
    await rows(
      "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE project_id = $1 AND status = 'upcoming'",
      [made.id],
    );
    const done = await approve(made.id, (m) => m * 8);
    expect(done.status).toBe('completed');
    expect((await credits(made.id))[0]?.status).toBe('pending');
    const after = await project(admin, made.id);
    const [last] = await rows<{ id: string; amount: number }>(
      `UPDATE payment_milestones SET status = 'upcoming', due_at = NULL
        WHERE id = (SELECT id FROM payment_milestones WHERE project_id = $1 AND payer = 'customer' ORDER BY position DESC LIMIT 1)
        RETURNING id, amount_paise::bigint::int AS amount`,
      [made.id],
    );
    const revisionId = after.budget.revisionQuotationId ?? '';
    const revision = await admin.get<QuotationDetail>(`/quotations/${revisionId}`);
    await admin.post(`/quotations/${revisionId}/send`);
    await admin.post(`/quotations/${revisionId}/accept`);
    const difference = revision.totalPaise - sale.quotation.totalPaise;
    expect((await credits(made.id))[0]).toMatchObject({
      status: 'applied',
      milestone_id: last?.id,
    });
    const [now] = await rows<{ amount: number }>(
      'SELECT amount_paise::bigint::int AS amount FROM payment_milestones WHERE id = $1',
      [last?.id],
    );
    expect(now?.amount).toBe((last?.amount ?? 0) + difference - 100_000);
  });
});
