import type { LeadDetail } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { createQuotation, newCustomer, today, uniquePhone } from '../support/sales';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// The lead's History tells the whole sale: converted, quotation sent, quotation accepted.
describe('Lead history', () => {
  let sales: Session;
  let admin: Session;

  beforeAll(async () => {
    sales = await Session.password(staffEmail('sales'), TEAM_PASSWORD);
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const lead = (id: string) => sales.get<LeadDetail>(`/leads/${id}`);
  const notes = async (id: string) => (await lead(id)).activities.map((row) => row.note);

  it('writes the convert, the send and the accept to History, and moves the stage', async () => {
    const customer = await newCustomer(sales, { name: 'History Customer (test)' });
    expect(await notes(customer.leadId)).toContain('Converted to a customer, with a new site.');

    const quotation = await createQuotation(sales, customer);
    // A draft is not sent yet: the lead stays where it was.
    expect((await lead(customer.leadId)).stage).toBe('new');

    await sales.post(`/quotations/${quotation.id}/send`);
    expect((await lead(customer.leadId)).stage).toBe('quoted');
    expect(await notes(customer.leadId)).toContain(
      `Quotation ${quotation.number} sent. Moved from New to Quotation sent.`,
    );

    await admin.post(`/quotations/${quotation.id}/accept`);
    expect((await lead(customer.leadId)).stage).toBe('won');
    expect(await notes(customer.leadId)).toContain(
      `Quotation ${quotation.number} accepted. Moved from Quotation sent to Won.`,
    );
  });

  it('will not mark a lead won before it is a customer', async () => {
    const created = await sales.post<{ id: string }>('/leads', {
      name: 'Not Yet Customer (test)',
      phone: uniquePhone(),
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    const reply = await sales.raw('PATCH', `/leads/${created.id}`, { stage: 'won' });
    expect(reply.status).toBe(400);
    expect((await lead(created.id)).stage).toBe('new');
  });
});
