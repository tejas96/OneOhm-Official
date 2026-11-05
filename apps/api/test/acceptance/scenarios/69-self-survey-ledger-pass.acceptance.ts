import type { QuotationDetail } from '@oneohm/api-contracts';
import { backfillLedger, postMilestoneDue } from '@oneohm/database';
import { allocateTax, discountTaxPaise, ratesOf } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';
import { instalments, offerSurvey, sendWholeSurvey } from '../support/self-survey';
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';

// Milestones released together or backfilled (redesign §7): each carries its share of the GST, and only the
// one booked last takes the rounding remainder, so the sum is the quotation GST less the discount's GST exactly.

describe('Self survey: GST when several instalments fall due in one pass', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function discounted(name: string) {
    const sale = await sellProject(admin, { name });
    const { ask } = await offerSurvey(admin, sale);
    await sendWholeSurvey(sale.customer.phone, sale, ask.id);
    const detail = await project(admin, sale.project.id);
    const task = taskByKey(detail, 'site_survey');
    await workTask(admin, task, { facts: await surveyFacts(admin, detail, task) });
    const quote = await admin.get<QuotationDetail>(`/quotations/${sale.quotation.id}`);
    const left =
      quote.totals.taxPaise -
      discountTaxPaise(
        ratesOf(quote.lines.filter((line) => line.extraKind !== 'optional')),
        100_000,
      );
    return { sale, left };
  }
  const bookings = (projectId: string) =>
    rows<{ id: string; gst: string }>(
      `SELECT m.id, coalesce(sum(l.credit_paise) FILTER (WHERE l.account_code = '2200'), 0)::text AS gst
         FROM payment_milestones m
         JOIN journal_entries e ON e.source_type = 'milestone_due' AND e.source_id::text = m.id::text
         JOIN journal_lines l ON l.entry_id = e.id
        WHERE m.project_id = $1 GROUP BY m.id, e.created_at, e.id ORDER BY e.created_at, e.id`,
      [projectId],
    );

  it('two instalments released together: the first posted takes its share, only the last takes the remainder', async () => {
    const { sale, left } = await discounted('Survey Together (test)');
    const db = acceptanceDb().db;
    const pending = (await instalments(sale.project.id)).filter((one) => one.status === 'upcoming');
    expect(pending.length).toBeGreaterThanOrEqual(2);
    // One trigger releases them: both get their due date first, then they are booked one after the other.
    await rows(
      "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE project_id = $1 AND status = 'upcoming'",
      [sale.project.id],
    );
    for (const one of pending)
      await db.transaction((tx) => postMilestoneDue(tx, one.id, admin.userId));
    const all = await instalments(sale.project.id);
    const shares = allocateTax(
      all.map((one) => one.amount),
      left,
    );
    const booked = await bookings(sale.project.id);
    expect(booked).toHaveLength(all.length);
    const gst = Object.fromEntries(booked.map((one) => [one.id, Number(one.gst)]));
    const first = pending[0];
    expect(gst[first?.id ?? '']).toBe(shares[all.findIndex((one) => one.id === first?.id)]);
    expect(booked.reduce((sum, one) => sum + Number(one.gst), 0)).toBe(left);
    expect(Number(booked.at(-1)?.gst)).toBeGreaterThanOrEqual(0);
  });

  it('two instalments booked at the same moment cannot both miss the remainder', async () => {
    const { sale, left } = await discounted('Survey Concurrent (test)');
    const db = acceptanceDb().db;
    const pending = (await instalments(sale.project.id)).filter((one) => one.status === 'upcoming');
    await rows(
      "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE project_id = $1 AND status = 'upcoming'",
      [sale.project.id],
    );
    await Promise.all(
      pending.map((one) => db.transaction((tx) => postMilestoneDue(tx, one.id, admin.userId))),
    );
    const booked = await bookings(sale.project.id);
    expect(booked.reduce((sum, one) => sum + Number(one.gst), 0)).toBe(left);
  });

  it('a backfill of a project whose instalments are all due gives each its share and the last the remainder', async () => {
    const { sale, left } = await discounted('Survey Backfill (test)');
    await rows(
      "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE project_id = $1 AND status = 'upcoming'",
      [sale.project.id],
    );
    await backfillLedger(acceptanceDb().db);
    const all = await instalments(sale.project.id);
    const booked = await bookings(sale.project.id);
    expect(booked).toHaveLength(all.length);
    expect(booked.reduce((sum, one) => sum + Number(one.gst), 0)).toBe(left);
    const shares = allocateTax(
      all.map((one) => one.amount),
      left,
    );
    for (const one of booked.slice(0, -1))
      expect(Number(one.gst)).toBe(shares[all.findIndex((m) => m.id === one.id)]);
    // Running it again books nothing new.
    await backfillLedger(acceptanceDb().db);
    expect(await bookings(sale.project.id)).toEqual(booked);
  });
});
