import type { Payable, PurchaseOrderDetail, Vendor } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { today } from '../support/sales';

// Bank details are checked the same way for vendors and contractors, and a vendor without
// a PAN cannot have a low TDS rate (Income-tax Act 2025 s.397(2)).
const tag = () => Math.random().toString(36).slice(2, 10);
const BANK = { bankAccountName: 'Asha Traders', bankIfsc: 'HDFC0000001' };

describe('Vendor bank details and PAN', () => {
  let admin: Session;
  let vendor: Vendor;

  beforeAll(async () => {
    admin = await Session.admin();
    vendor = await admin.post<Vendor>('/inventory/vendors', {
      name: `No PAN Vendor ${tag()} (test)`,
      gstin: null,
      contactName: null,
      phone: '',
      email: '',
      address: null,
      paymentTermsDays: 30,
    });
  });

  it('refuses a vendor account number typed twice differently', async () => {
    const reply = await admin.raw('PATCH', `/inventory/vendors/${vendor.id}`, {
      ...BANK,
      bankAccountNumber: '123456789012',
      bankAccountNumberConfirm: '123456789013',
    });
    expect(reply.status).toBe(400);
  });

  it('refuses a new number sent without the second typing', async () => {
    const reply = await admin.raw('PATCH', `/inventory/vendors/${vendor.id}`, {
      ...BANK,
      bankAccountNumber: '123456789012',
    });
    expect(reply.status).toBe(400);
  });

  it('saves a number typed twice and shows it masked', async () => {
    const saved = await admin.patch<Vendor>(`/inventory/vendors/${vendor.id}`, {
      ...BANK,
      bankAccountNumber: '123456789012',
      bankAccountNumberConfirm: '123456789012',
    });
    expect(saved.bankAccountMasked).toBe('•••• 9012');
    expect(JSON.stringify(saved)).not.toContain('123456789012');
  });

  it('refuses 1% TDS on a service bill from a vendor with no PAN, and takes 20%', async () => {
    const bill = await admin.post<Payable>('/finance/payables', {
      party: 'vendor',
      partyName: vendor.name,
      description: 'Site survey service (test)',
      amountPaise: 100_000,
      dueOn: today(),
    });
    const low = await admin.raw('PATCH', `/finance/payables/${bill.id}`, {
      vendorInvoicePaise: null,
      tdsBp: 100,
    });
    expect(low.status).toBe(409);
    expect(JSON.stringify(low.body)).toContain('Add their PAN on the vendor page');
    const ok = await admin.raw('PATCH', `/finance/payables/${bill.id}`, {
      vendorInvoicePaise: null,
      tdsBp: 2000,
    });
    expect(ok.status).toBe(200);
  });

  it('refuses 1% but allows 5% TDS on a goods bill from a vendor with no PAN', async () => {
    const order = await admin.post<PurchaseOrderDetail>('/inventory/purchase-orders', {
      vendorId: vendor.id,
      projectId: null,
      orderDate: today(),
      expectedOn: null,
      lines: [
        {
          productId: null,
          description: 'Cable ties (test)',
          unit: 'nos',
          quantity: 10,
          ratePaise: 10_000,
          taxRateBp: 1800,
        },
      ],
    });
    await admin.post(`/inventory/purchase-orders/${order.id}/send`);
    const line = order.lines[0];
    await admin.post(`/inventory/purchase-orders/${order.id}/receipts`, {
      locationId: null,
      receivedOn: today(),
      vendorInvoiceNumber: `INV-${tag()}`,
      vendorInvoiceDate: today(),
      lines: [{ lineId: line?.id, quantity: 10 }],
    });
    const bills = await admin.get<Payable[]>('/finance/payables');
    const bill = bills.find(
      (p) => p.partyName === vendor.name && p.description.includes('against'),
    );
    expect(bill, 'the receipt raised a bill').toBeDefined();
    const low = await admin.raw('PATCH', `/finance/payables/${bill?.id}`, {
      vendorInvoicePaise: null,
      tdsBp: 100,
    });
    expect(low.status).toBe(409);
    expect(JSON.stringify(low.body)).toContain('at least 5%');
    const ok = await admin.raw('PATCH', `/finance/payables/${bill?.id}`, {
      vendorInvoicePaise: null,
      tdsBp: 500,
    });
    expect(ok.status).toBe(200);
  });

  it('takes 1% once the vendor has a PAN, and reads one from a GSTIN', async () => {
    const saved = await admin.patch<Vendor>(`/inventory/vendors/${vendor.id}`, {
      pan: 'abcde1234f',
    });
    expect(saved.pan).toBe('ABCDE1234F');
    const bill = await admin.post<Payable>('/finance/payables', {
      party: 'vendor',
      partyName: vendor.name,
      description: 'Another service (test)',
      amountPaise: 100_000,
      dueOn: today(),
    });
    const reply = await admin.raw('PATCH', `/finance/payables/${bill.id}`, {
      vendorInvoicePaise: null,
      tdsBp: 100,
    });
    expect(reply.status).toBe(200);
  });
});
