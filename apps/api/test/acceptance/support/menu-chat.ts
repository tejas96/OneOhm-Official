import type { Property, QuotationDetail } from '@oneohm/api-contracts';
import { expect } from 'vitest';
import { rows } from './db';
import type { Session } from './http';
import { choices, lastReply, say } from './onboarding';
import { discomId, quoteInput, type Sale, sellProject, today } from './sales';

/** Helpers for the WhatsApp menu-path scenarios (menu audit, 3 Nov 2026). */

/** The bot's last reply offers taps (buttons or list rows): the way forward. */
export async function endsWithTaps(phone: string) {
  const reply = await lastReply(phone);
  expect(choices(reply).length, reply?.body).toBeGreaterThan(0);
  return reply;
}

export const requestsOf = (customerId: string) =>
  rows<{ project_id: string | null; description: string }>(
    'SELECT project_id, description FROM service_requests WHERE customer_id = $1',
    [customerId],
  );

export const alerts = (chatId: string, kind: string) =>
  rows('SELECT 1 FROM notifications WHERE kind = $1 AND subject_id = $2', [kind, chatId]);

/** A sold customer who said hello: the menu is the last reply. */
export async function customerInChat(admin: Session, name: string): Promise<Sale> {
  const sale = await sellProject(admin, { name });
  await say(sale.customer.phone, 'hi');
  expect((await lastReply(sale.customer.phone))?.kind).toBe('list');
  return sale;
}

/** A second home (in Pune) with its own project, for the same customer. */
export async function secondHome(admin: Session, sale: Sale): Promise<string> {
  const site = await admin.post<Property>(`/customers/${sale.customer.customerId}/properties`, {
    label: 'Farm house (test)',
    addressLine: '9 Baner Road (test)',
    city: 'Pune',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '411045',
    subsidyCategory: 'individual',
    floors: 1,
  });
  const quote = await admin.post<QuotationDetail>('/quotations', {
    propertyId: site.id,
    leadId: null,
    ...(await quoteInput(admin)),
  });
  await admin.post(`/quotations/${quote.id}/send`);
  await admin.post(`/quotations/${quote.id}/accept`);
  const project = await admin.post<{ id: string }>('/projects', {
    quotationId: quote.id,
    discomId: await discomId(admin, 'MSEDCL'),
    loan: false,
    lenderName: null,
    loanPaise: 0,
    battery: false,
    groundMount: false,
    startDate: today(),
    managerUserId: admin.userId,
  });
  return project.id;
}
