import type { ProjectMaterial, QuotationDetail } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { catalog, newCustomer, quoteInput, sellProject } from '../support/sales';

// A quotation can carry several inverters: more of one model, or a mix of models. Every
// reader (price, saved quotation, project facts, store needs, PDF) sees all of them.
describe('Several inverters on one quotation', () => {
  let admin: Session;
  let items: Awaited<ReturnType<typeof catalog>>;

  beforeAll(async () => {
    admin = await Session.admin();
    items = await catalog(admin);
  });

  const mixed = () => [
    { productId: items.inverter10k, quantity: 2 },
    { productId: items.inverter5k, quantity: 1 },
  ];

  it('prices one line per model with its count and saves them in order', async () => {
    const customer = await newCustomer(admin, {
      name: 'Two Inverter Business (test)',
      category: 'commercial',
    });
    const base = await quoteInput(admin, { category: 'commercial', targetWp: 25_000 });
    const quotation = await admin.post<QuotationDetail>('/quotations', {
      ...base,
      inverterProductId: undefined,
      inverters: mixed(),
      propertyId: customer.propertyId,
      leadId: customer.leadId,
    });
    expect(quotation.input.inverters).toEqual(mixed());
    expect(quotation.input.inverterProductId).toBe(items.inverter10k);
    const inverterLines = quotation.lines.filter((line) => line.category === 'inverter');
    expect(inverterLines.map((line) => [line.key, line.quantity])).toEqual([
      ['inverter', 2],
      ['inverter_2', 1],
    ]);

    const pdf = await admin.download(`/quotations/${quotation.id}/pdf`);
    expect(pdf.status).toBe(200);
  });

  it('still takes one inverter from older clients', async () => {
    const customer = await newCustomer(admin, { name: 'Older App Customer (test)' });
    const quotation = await admin.post<QuotationDetail>('/quotations', {
      ...(await quoteInput(admin, { inverter: 'inverter3k' })),
      propertyId: customer.propertyId,
    });
    expect(quotation.input.inverters).toEqual([{ productId: items.inverter3k, quantity: 1 }]);
  });

  it('refuses a quotation with no inverter, or with a panel in the inverter place', async () => {
    const base = await quoteInput(admin);
    const none = await admin.raw('POST', '/quotations/preview', {
      ...base,
      inverterProductId: undefined,
    });
    expect(none.status).toBe(400);
    const wrong = await admin.raw('POST', '/quotations/preview', {
      ...base,
      inverterProductId: undefined,
      inverters: [{ productId: items.dcrPanel, quantity: 1 }],
    });
    expect(wrong.status).toBe(400);
  });

  it('gives the project every inverter: facts for DISCOM forms and store needs', async () => {
    const sale = await sellProject(admin, {
      name: 'Mixed Inverter Project (test)',
      category: 'commercial',
      targetWp: 25_000,
      extra: { inverterProductId: undefined, inverters: mixed() },
    });
    expect(sale.project.facts.inverter_total_kw).toBe('25');
    expect(sale.project.facts.inverter_make).toContain('× 2');

    const material = await admin.get<ProjectMaterial>(`/projects/${sale.project.id}/material`);
    const need = (productId: string) =>
      material.requirements.find((row) => row.productId === productId)?.needed;
    expect(need(items.inverter10k)).toBe(2);
    expect(need(items.inverter5k)).toBe(1);
  });
});
