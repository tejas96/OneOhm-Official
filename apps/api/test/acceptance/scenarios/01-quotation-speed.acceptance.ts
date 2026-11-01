import type { QuotationDetail, QuotationPreview } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor } from '../support/db';
import { Session } from '../support/http';
import { createQuotation, newCustomer, quoteInput } from '../support/sales';
import { STAFF, staffEmail, TEAM_PASSWORD } from '../support/team';

// PRD 13 "Quotation speed": a quotation with price, subsidy and effective cost is
// generated and shared in a few minutes without a survey.
describe('Quotation speed', () => {
  let sales: Session;
  const started = Date.now();

  beforeAll(async () => {
    sales = await Session.password(staffEmail('sales'), TEAM_PASSWORD);
    expect(sales.name).toBe(STAFF.sales.name);
  });
  afterAll(closeDb);

  it('prices a fresh enquiry instantly, before any site is on record', async () => {
    const preview = await sales.post<QuotationPreview>('/quotations/preview', {
      ...(await quoteInput(sales, { targetWp: 3000 })),
      propertyId: null,
    });
    expect(preview.totals.totalPaise).toBeGreaterThan(0);
    expect(preview.totals.subsidyPaise).toBeGreaterThan(0);
    expect(preview.totals.effectivePaise).toBe(
      preview.totals.totalPaise - preview.totals.subsidyPaise,
    );
    // The DCR / non-DCR comparison is part of the instant answer.
    expect(preview.comparison?.nonDcr.subsidyPaise).toBe(0);
  });

  it('goes from new lead to a sent quotation PDF in well under a few minutes', async () => {
    const customer = await newCustomer(sales, { name: 'Quick Quote Customer (test)' });
    const quotation = await createQuotation(sales, customer, { targetWp: 3000 });
    expect(quotation.status).toBe('draft');
    expect(quotation.totals.totalPaise).toBeGreaterThan(0);
    expect(quotation.totals.subsidyPaise).toBeGreaterThan(0);
    expect(quotation.totals.effectivePaise).toBe(
      quotation.totals.totalPaise - quotation.totals.subsidyPaise,
    );

    const pdf = await sales.download(`/quotations/${quotation.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.type).toContain('application/pdf');
    expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');

    const sent = await sales.post<QuotationDetail>(`/quotations/${quotation.id}/send`);
    expect(sent.status).toBe('sent');
    const queued = await outboxFor(customer.phone);
    expect(queued.some((row) => /quotation/i.test(row.template))).toBe(true);

    const seconds = (Date.now() - started) / 1000;
    console.info(`Quotation speed: lead → sent PDF in ${seconds.toFixed(1)} s`);
    expect(seconds).toBeLessThan(120);
  });

  it('needs no site survey: the quotation stands on its own', async () => {
    const list =
      await sales.get<{ id: string; projectId: string | null; status: string }[]>(
        '/quotations?status=sent',
      );
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((row) => row.projectId === null)).toBe(true);
  });
});
