import { type DatabaseExecutor, projectTasks, waConversations } from '@oneohm/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  templates: [] as { template: string; key: string }[],
  replies: [] as { reply: Record<string, unknown>; key: string | undefined }[],
  notices: [] as string[],
  route: 'whatsapp',
}));

vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  noticeCustomer: async (
    _db: unknown,
    _phone: string,
    _template: string,
    _p: unknown,
    key: string,
  ) => {
    calls.notices.push(key);
  },
  plainNames: async (_db: unknown, payload: unknown) => payload,
  routeOfCustomer: async () => calls.route,
}));
vi.mock('../../common/outbox', () => ({
  queueWhatsApp: async (
    _db: unknown,
    _phone: string,
    template: string,
    _p: unknown,
    key: string,
  ) => {
    calls.templates.push({ template, key });
  },
}));
vi.mock('../whatsapp/chat-store', () => ({
  queueReply: async (
    _db: unknown,
    _chat: unknown,
    reply: Record<string, unknown>,
    _by: unknown,
    key?: string,
  ) => {
    calls.replies.push({ reply, key });
  },
}));
vi.mock('./payment-contact', () => ({
  contactFor: async () => ({
    language: 'mr',
    contact: { name: 'Priya', phone: '+919800000009' },
  }),
}));
vi.mock('../../config/environment-once', () => ({
  environmentOnce: () => ({ RAZORPAY_MODE: 'off' }),
}));
vi.mock('../whatsapp/file-links', () => ({
  sharedFileUrl: () => 'https://files.test/receipt.pdf',
}));
vi.mock('../reports/pdf-file-name', () => ({ customerPdfName: () => 'Receipt-Asha.pdf' }));

import { type PaidNews, tellCustomerPaid } from './receipt-message';

const news: PaidNews = {
  paymentId: 'pay1',
  receiptNumber: 'R-1',
  phone: '+919800000001',
  customerName: 'Asha Patil',
  customerId: 'c1',
  projectId: 'p1',
  projectCode: 'OH-1',
  amountPaise: 4_000_000,
  milestoneId: 'm1',
  milestoneLabel: 'Advance',
  leftPaise: 0,
  trigger: 'quotation_accepted',
  dedupeKey: 'payment:m1:4000000',
};

/** A database with a chat (open or not) and a site survey task in the given state. */
function fakeDb(chat: Record<string, unknown> | null, survey: { status: string } | null) {
  const query = (result: unknown[]) => {
    const q = {
      from: (table: unknown) => query(rowsOf(table)),
      where: () => q,
      limit: async () => result,
    };
    return q;
  };
  const rowsOf = (table: unknown) => {
    if (table === waConversations) return chat ? [chat] : [];
    if (table === projectTasks) return survey ? [survey] : [];
    return [];
  };
  return { select: () => query([]) } as unknown as DatabaseExecutor;
}

const openChat = { id: 'chat1', phone: news.phone, at: new Date(), optedOutAt: null };

describe('the payment-received news', () => {
  beforeEach(() => {
    calls.templates.length = 0;
    calls.replies.length = 0;
    calls.notices.length = 0;
    calls.route = 'whatsapp';
  });

  it('inside the window is ONE chat message with the receipt on top, and no template', async () => {
    await tellCustomerPaid(fakeDb(openChat, { status: 'completed' }), news);
    expect(calls.templates).toEqual([]);
    expect(calls.notices).toEqual(['payment:m1:4000000']);
    expect(calls.replies).toHaveLength(1);
    const [only] = calls.replies;
    expect(only?.key).toBe('paid_next:pay1');
    expect(only?.reply).toMatchObject({
      kind: 'buttons',
      header: { document: { url: 'https://files.test/receipt.pdf', filename: 'Receipt-Asha.pdf' } },
    });
    expect(only?.reply.buttons).toHaveLength(3);
  });

  it('every chat row carries the payment_received template as its fallback, with the receipt', async () => {
    await tellCustomerPaid(fakeDb(openChat, null), { ...news, leftPaise: 100 });
    await tellCustomerPaid(fakeDb(openChat, { status: 'completed' }), news);
    const fallback = {
      template: 'payment_received',
      payload: expect.objectContaining({
        documentUrl: 'https://files.test/receipt.pdf',
        documentName: 'Receipt-Asha.pdf',
        project: 'OH-1',
      }),
      dedupeKey: news.dedupeKey,
    };
    // receipt_pdf, paid_left (its Menu/Talk taps need none), then paid_next.
    const keyed = calls.replies.filter((item) => item.key);
    expect(keyed.map((item) => item.key)).toEqual([
      'receipt_pdf:pay1',
      'paid_left:pay1',
      'paid_next:pay1',
    ]);
    for (const item of keyed) expect(item.reply.fallback).toMatchObject(fallback);
  });

  it('outside the window sends the template with the file, as before', async () => {
    const stale = { ...openChat, at: new Date(Date.now() - 30 * 3600_000) };
    await tellCustomerPaid(fakeDb(stale, null), news);
    expect(calls.templates).toEqual([{ template: 'payment_received', key: news.dedupeKey }]);
    expect(calls.replies).toEqual([]);
  });

  it('after STOP or with no chat is the template route, never a chat message', async () => {
    await tellCustomerPaid(fakeDb({ ...openChat, optedOutAt: new Date() }, null), news);
    await tellCustomerPaid(fakeDb(null, null), news);
    expect(calls.templates).toHaveLength(2);
    expect(calls.replies).toEqual([]);
  });

  it('for a customer who is on SMS goes the routed way even in the window', async () => {
    calls.route = 'sms';
    await tellCustomerPaid(fakeDb(openChat, null), news);
    expect(calls.templates).toHaveLength(1);
    expect(calls.replies).toEqual([]);
  });

  it('a part payment in the window is the receipt file, then what is left, no template', async () => {
    await tellCustomerPaid(fakeDb(openChat, null), { ...news, leftPaise: 100 });
    expect(calls.templates).toEqual([]);
    expect(calls.replies.map((item) => item.key)).toEqual(['receipt_pdf:pay1', 'paid_left:pay1']);
    expect(calls.replies[0]?.reply.kind).toBe('document');
  });

  it('says the site survey is next only while it is still to do', async () => {
    await tellCustomerPaid(fakeDb(openChat, { status: 'ready' }), news);
    await tellCustomerPaid(fakeDb(openChat, { status: 'completed' }), news);
    await tellCustomerPaid(fakeDb(openChat, null), news);
    const [pending, done, none] = calls.replies.map((item) => item.reply.body);
    expect(pending).toContain('तांत्रिक साइट सर्वेक्षण');
    expect(done).toContain('अंतिम रचना');
    expect(none).toBe(done);
  });
});
