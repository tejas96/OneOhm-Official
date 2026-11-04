import type {
  CommissionEntry,
  QuotationDetail,
  QuotationPreview,
  ResellerEarnings,
} from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import {
  type Customer,
  createQuotation,
  discomId,
  newCustomer,
  quoteInput,
  today,
} from '../support/sales';
import { RESELLERS } from '../support/team';

interface ResellerCustomer {
  leadId: string;
  name: string;
  project: { id: string; code: string; valuePaise: number } | null;
  commission: { status: string; amountPaise: number } | null;
}

// PRD 13 "Reseller app": a reseller sees only their own leads, projects, commission and
// payments; cost and margin never reach them.
describe('Reseller app', () => {
  let admin: Session;
  let first: Session;
  let second: Session;
  let mineLead: Customer;
  let theirsLead: Customer;
  let mineQuote: QuotationDetail;
  let theirsQuote: QuotationDetail;
  let projectId = '';

  beforeAll(async () => {
    admin = await Session.admin();
    first = await Session.code(RESELLERS.first.phone);
    second = await Session.code(RESELLERS.second.phone);
    // The first reseller earns 2% once the project is created (their own rule).
    await admin.put(`/commission-rules/resellers/${first.userId}`, {
      basis: 'percent',
      rateBp: 200,
      perKwPaise: 0,
      qualifyingEvent: 'project_created',
      active: true,
    });
    mineLead = await newCustomer(first, { name: 'Reseller One Lead (test)' });
    theirsLead = await newCustomer(second, { name: 'Reseller Two Lead (test)' });
    mineQuote = await createQuotation(first, mineLead, { targetWp: 3000 });
    theirsQuote = await createQuotation(second, theirsLead, { targetWp: 2000 });
  });

  it('quotes their own customers with cost and margin hidden', async () => {
    expect(mineQuote.totals.totalPaise).toBeGreaterThan(0);
    expect(mineQuote.totals.costPaise).toBe(0);
    expect(mineQuote.totals.marginPaise).toBe(0);
    expect(mineQuote.lines.every((line) => line.costPaise === 0)).toBe(true);
    expect(mineQuote.costing?.build).toBeUndefined();
    const preview = await first.post<QuotationPreview>('/quotations/preview', {
      ...(await quoteInput(first, { targetWp: 3000 })),
      propertyId: null,
    });
    expect(preview.totals.costPaise).toBe(0);
    expect(preview.totals.marginPaise).toBe(0);
    // The office sees the real cost of the same quotation, so something was hidden.
    const office = await admin.get<QuotationDetail>(`/quotations/${mineQuote.id}`);
    expect(office.totals.costPaise).toBeGreaterThan(0);
  });

  it('lists only their own leads, quotations and customers', async () => {
    const leads = await first.get<{ id: string }[]>('/leads');
    expect(leads.map((lead) => lead.id)).toContain(mineLead.leadId);
    expect(leads.map((lead) => lead.id)).not.toContain(theirsLead.leadId);
    const quotes = await first.get<{ id: string }[]>('/quotations');
    expect(quotes.map((quote) => quote.id)).toContain(mineQuote.id);
    expect(quotes.map((quote) => quote.id)).not.toContain(theirsQuote.id);
    const customers = await first.get<ResellerCustomer[]>('/me/customers');
    expect(customers.map((row) => row.leadId)).toContain(mineLead.leadId);
    expect(customers.map((row) => row.leadId)).not.toContain(theirsLead.leadId);
  });

  it("cannot open or act on another reseller's lead or quotation", async () => {
    const statuses = await Promise.all([
      first.raw('GET', `/leads/${theirsLead.leadId}`),
      first.raw('PATCH', `/leads/${theirsLead.leadId}`, { notes: 'Taken over (test)' }),
      first.raw('GET', `/quotations/${theirsQuote.id}`),
      first.raw('POST', `/quotations/${theirsQuote.id}/send`),
      first.raw('POST', `/quotations/${theirsQuote.id}/accept`),
      first.raw('GET', `/quotations/${theirsQuote.id}/pdf`),
    ]);
    for (const reply of statuses) expect([403, 404]).toContain(reply.status);
  });

  it('cannot reach office-only records: projects, customers, finance or all commissions', async () => {
    for (const path of ['/projects', '/customers', '/finance/payments', '/commissions']) {
      expect([401, 403], path).toContain((await first.raw('GET', path)).status);
    }
  });

  it('sees the project and commission from their won sale, approved and paid', async () => {
    await first.post(`/quotations/${mineQuote.id}/send`);
    await first.post(`/quotations/${mineQuote.id}/accept`);
    const created = await admin.post<{ id: string }>('/projects', {
      quotationId: mineQuote.id,
      discomId: await discomId(admin, 'MSEDCL'),
      managerUserId: admin.userId,
      startDate: today(),
    });
    projectId = created.id;

    const open = await admin.get<CommissionEntry[]>(`/commissions?resellerId=${first.userId}`);
    const entry = open.find((row) => row.projectId === projectId);
    expect(entry?.status).toBe('pending');
    expect(entry?.rateBp).toBe(200);
    expect(entry?.amountPaise).toBe(Math.round(((entry?.projectValuePaise ?? 0) * 200) / 10_000));
    await admin.post(`/commissions/${entry?.id}/approve`);
    // Finance cannot pay until the reseller's payout details are in.
    await admin.put(`/resellers/${first.userId}/payout-details`, {
      bankAccountName: null,
      bankAccountNumber: null,
      bankIfsc: null,
      upiId: 'sai.solar@okaxis',
      pan: 'ABCDE1234F',
    });
    await admin.post(`/commissions/${entry?.id}/pay`, {
      method: 'bank_transfer',
      paidOn: today(),
      reference: 'NEFT-RESELLER-TEST',
    });

    const earnings = await first.get<ResellerEarnings>('/me/commission');
    const paid = earnings.entries.find((row) => row.projectId === projectId);
    expect(paid?.status).toBe('paid');
    expect(paid?.paidReference).toBe('NEFT-RESELLER-TEST');
    expect(earnings.totals.paidPaise).toBeGreaterThanOrEqual(paid?.amountPaise ?? 1);
    const customers = await first.get<ResellerCustomer[]>('/me/customers');
    const row = customers.find((candidate) => candidate.leadId === mineLead.leadId);
    expect(row?.project?.id).toBe(projectId);
    expect(row?.commission?.status).toBe('paid');
    expect(JSON.stringify(customers)).not.toMatch(/costPaise|marginPaise/);
  });

  it('never shows that sale or its commission to the other reseller', async () => {
    const earnings = await second.get<ResellerEarnings>('/me/commission');
    expect(earnings.entries.some((row) => row.projectId === projectId)).toBe(false);
    const customers = await second.get<ResellerCustomer[]>('/me/customers');
    expect(customers.some((row) => row.project?.id === projectId)).toBe(false);
    expect(customers.map((row) => row.leadId)).toContain(theirsLead.leadId);
  });
});
