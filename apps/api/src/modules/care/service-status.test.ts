import type { DatabaseExecutor } from '@oneohm/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  open: true,
  language: 'mr',
  replies: [] as { body: string }[],
  templates: [] as { template: string; payload: Record<string, string> }[],
}));

vi.mock('../send-to-customer/send-context', () => ({ chatOpenFor: async () => calls.open }));
vi.mock('../documents/document-request-messages', () => ({
  languageOfPhone: async () => calls.language,
}));
vi.mock('../whatsapp/chat-store', () => ({
  conversationForPhone: async () => ({ id: 'c1', phone: '+919800000001' }),
  queueReply: async (_db: unknown, _chat: unknown, reply: { body: string }) => {
    calls.replies.push(reply);
  },
}));
vi.mock('../../common/outbox', () => ({
  queueWhatsApp: async (
    _db: unknown,
    _phone: string,
    template: string,
    payload: Record<string, string>,
  ) => {
    calls.templates.push({ template, payload });
  },
}));
vi.mock('@oneohm/database', () => ({ noticeCustomer: async () => undefined }));

import { tellServiceStatus } from './service-status';

const db = {} as DatabaseExecutor;
const request = {
  id: 'r1',
  category: 'inverter_error',
  topic: 'inverter error or alarm',
  customer: { name: 'Asha', phone: '+919800000001' },
};
const now = new Date('2026-11-06T04:00:00Z');

beforeEach(() => {
  calls.open = true;
  calls.language = 'mr';
  calls.replies = [];
  calls.templates = [];
});

describe('tellServiceStatus', () => {
  it('says "being worked on" in the chat in the customer language when the window is open', async () => {
    expect(await tellServiceStatus(db, request, 'in_progress', now)).toBe('chat');
    expect(calls.templates).toHaveLength(0);
    expect(calls.replies[0]?.body).toContain('इन्व्हर्टर');
    expect(calls.replies[0]?.body).not.toContain('inverter error');
  });

  it('speaks Hindi and English too', async () => {
    calls.language = 'hi';
    await tellServiceStatus(db, request, 'in_progress', now);
    calls.language = 'en';
    await tellServiceStatus(db, request, 'in_progress', now);
    expect(calls.replies[0]?.body).toContain('काम शुरू');
    expect(calls.replies[1]?.body).toContain('started work');
  });

  it('names the visit day for a booked visit', async () => {
    calls.language = 'en';
    await tellServiceStatus(db, request, 'booked', now, '2026-11-09');
    expect(calls.replies[0]?.body).toContain('9 November');
  });

  it('falls back to the service_update template when the chat is closed', async () => {
    calls.open = false;
    expect(await tellServiceStatus(db, request, 'in_progress', now)).toBe('template');
    expect(calls.replies).toHaveLength(0);
    expect(calls.templates[0]).toEqual({
      template: 'service_update',
      payload: { customer: 'Asha', topic: 'inverter error or alarm', status: 'being worked on' },
    });
  });
});
