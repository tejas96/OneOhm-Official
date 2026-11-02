import type { Property, QuotationDetail } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { type Customer, newCustomer, quoteInput, today, uniquePhone } from '../support/sales';

// PRD 3.2: a customer can have several sites. Each site has its own name and its own
// consumer number; no two sites anywhere may share a number, however it is typed.

interface Failure {
  message: string;
  fieldErrors?: Record<string, string>;
}

/** A fresh 12-digit consumer number, like an MSEDCL bill's. */
const consumerNumber = () => `19${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`;

const site = (overrides: Record<string, unknown> = {}) => ({
  label: 'Shop (test)',
  addressLine: '4 Market Yard (test)',
  city: 'Sangli',
  district: 'Sangli',
  state: 'Maharashtra',
  pincode: '416416',
  subsidyCategory: 'commercial',
  floors: 1,
  ...overrides,
});

describe('Customers with more than one site', () => {
  let admin: Session;
  let customer: Customer;
  let firstNumber: string;

  beforeAll(async () => {
    admin = await Session.admin();
    firstNumber = consumerNumber();
    customer = await newCustomer(admin, { name: 'Two Sites (test)', consumerNumber: firstNumber });
  });

  it('adds a second site with its own consumer number, saved without spaces', async () => {
    const number = consumerNumber();
    const spaced = `${number.slice(0, 4)} ${number.slice(4, 8)}-${number.slice(8)}`;
    const added = await admin.post<Property>(
      `/customers/${customer.customerId}/properties`,
      site({ consumerNumber: spaced }),
    );
    expect(added.customerId).toBe(customer.customerId);
    expect(added.consumerNumber).toBe(number);
    const detail = await admin.get<{ properties: Property[] }>(`/customers/${customer.customerId}`);
    expect(detail.properties.map((row) => row.id)).toEqual([customer.propertyId, added.id]);
  });

  it('refuses a consumer number another site has, however it is typed', async () => {
    const spaced = `${firstNumber.slice(0, 6)} ${firstNumber.slice(6)}`;
    const reply = await admin.raw<Failure>(
      'POST',
      `/customers/${customer.customerId}/properties`,
      site({ label: 'Farm (test)', consumerNumber: spaced }),
    );
    expect(reply.status).toBe(400);
    expect(reply.body.fieldErrors?.consumerNumber).toBeTruthy();
  });

  it('refuses it for another customer too, from the lead and from an edit', async () => {
    const other = await newCustomer(admin, { name: 'Neighbour (test)' });
    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'Copycat (test)',
      phone: uniquePhone(),
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    const convert = await admin.raw<Failure>('POST', `/leads/${lead.id}/customer`, {
      kind: 'individual',
      property: site({ label: 'Home', subsidyCategory: 'individual', consumerNumber: firstNumber }),
    });
    expect(convert.status).toBe(400);
    expect(convert.body.fieldErrors?.['property.consumerNumber']).toBeTruthy();

    const edit = await admin.raw<Failure>('PATCH', `/properties/${other.propertyId}`, {
      consumerNumber: firstNumber,
    });
    expect(edit.status).toBe(400);
    expect(edit.body.fieldErrors?.consumerNumber).toBeTruthy();
  });

  it('lets a site keep its own number when other details change', async () => {
    const saved = await admin.patch<Property>(`/properties/${customer.propertyId}`, {
      consumerNumber: firstNumber,
      floors: 2,
    });
    expect(saved.consumerNumber).toBe(firstNumber);
    expect(saved.floors).toBe(2);
  });

  it('refuses a consumer number that is not one', async () => {
    for (const bad of ['12345', 'PENDING', '190012345678 (test)']) {
      const reply = await admin.raw<Failure>(
        'POST',
        `/customers/${customer.customerId}/properties`,
        site({ label: `Bad ${bad} (test)`, consumerNumber: bad }),
      );
      expect(reply.status, bad).toBe(400);
      expect(reply.body.fieldErrors?.consumerNumber, bad).toBeTruthy();
    }
  });

  it('refuses a second site with the same name', async () => {
    const reply = await admin.raw<Failure>(
      'POST',
      `/customers/${customer.customerId}/properties`,
      site({ label: ' shop (TEST) ' }),
    );
    expect(reply.status).toBe(400);
    expect(reply.body.fieldErrors?.label).toBeTruthy();
  });

  it('numbers a site from a second lead instead of repeating its name', async () => {
    // One open lead per phone: the first one is closed before they come back.
    await admin.patch(`/leads/${customer.leadId}`, { stage: 'lost', lostReasonKey: 'price' });
    const lead = await admin.post<{ id: string }>('/leads', {
      name: customer.name,
      phone: customer.phone,
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    const converted = await admin.post<{ customerId: string; propertyId: string }>(
      `/leads/${lead.id}/customer`,
      {
        kind: 'individual',
        property: site({ label: 'Site (test)', subsidyCategory: 'individual' }),
      },
    );
    expect(converted.customerId).toBe(customer.customerId);
    const added = await admin.get<Property>(`/properties/${converted.propertyId}`);
    expect(added.label).toBe('Site (test) 2');
  });

  it('does not move the lead of one site with a quotation for another', async () => {
    const owner = await newCustomer(admin, { name: 'Lead Per Site (test)' });
    const shop = await admin.post<Property>(
      `/customers/${owner.customerId}/properties`,
      site({ subsidyCategory: 'individual', consumerNumber: consumerNumber() }),
    );
    const onShop = await admin.post<QuotationDetail>('/quotations', {
      propertyId: shop.id,
      ...(await quoteInput(admin)),
    });
    expect(onShop.input.leadId).toBeNull();
    const onHome = await admin.post<QuotationDetail>('/quotations', {
      propertyId: owner.propertyId,
      ...(await quoteInput(admin)),
    });
    expect(onHome.input.leadId).toBe(owner.leadId);
  });

  it('says so when the customer does not exist', async () => {
    const reply = await admin.raw<Failure>(
      'POST',
      '/customers/00000000-0000-4000-8000-000000000000/properties',
      site(),
    );
    expect(reply.status).toBe(404);
  });
});
