import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bodyOf } from '../support/care';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { tap } from '../support/onboarding';
import { createQuotation, newCustomer } from '../support/sales';
import { openChat } from '../support/send';

// A revision sent with "What changed" (redesign §9): the customer reads the change line first.

describe('Quote: what changed on a revision', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('puts the change line before the money, and keeps it for Send again and See quotation', async () => {
    const customer = await newCustomer(admin, { name: 'Quote Revision (test)' });
    const quotation = await createQuotation(admin, customer);
    await openChat(customer.phone, customer.customerId);
    await admin.post(`/quotations/${quotation.id}/send`, { whatChanged: 'Panels are now 540 Wp.' });
    expect(await bodyOf(customer.phone)).toMatch(
      /^\*What changed:\* Panels are now 540 Wp\.\n\nYour solar quotation is above/,
    );

    // Sent again without a new note: the same line; an empty note takes it away.
    await admin.post(`/quotations/${quotation.id}/send`, {});
    expect(await bodyOf(customer.phone)).toContain('*What changed:* Panels are now 540 Wp.');
    await tap(customer.phone, `quote_show:${quotation.id}`);
    expect(await bodyOf(customer.phone)).toContain('*What changed:* Panels are now 540 Wp.');
    await admin.post(`/quotations/${quotation.id}/send`, { whatChanged: '' });
    expect(await bodyOf(customer.phone)).not.toContain('What changed');
  });

  it('says it in Marathi, and refuses a line longer than 200 characters', async () => {
    const customer = await newCustomer(admin, { name: 'Quote Revision Marathi (test)' });
    const quotation = await createQuotation(admin, customer);
    await openChat(customer.phone, customer.customerId);
    await tap(customer.phone, 'lang:mr');
    await admin.post(`/quotations/${quotation.id}/send`, { whatChanged: 'किंमत कमी केली.' });
    expect(await bodyOf(customer.phone)).toContain('*काय बदलले:* किंमत कमी केली.');
    const long = await admin.raw('POST', `/quotations/${quotation.id}/send`, {
      whatChanged: 'x'.repeat(201),
    });
    expect(long.status).toBe(400);
  });
});
