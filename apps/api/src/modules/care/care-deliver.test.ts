import type { DatabaseExecutor } from '@oneohm/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ open: true, mayChat: false, queued: [] as string[] }));

vi.mock('../send-to-customer/send-context', () => ({ chatOpenFor: async () => state.open }));
vi.mock('../journey/auto-messages', () => ({ mayChat: async () => state.mayChat }));
vi.mock('../documents/document-request-messages', () => ({ languageOfPhone: async () => 'en' }));
vi.mock('../whatsapp/chat-store', () => ({
  conversationForPhone: async () => ({ id: 'c1', phone: 'p' }),
  queueReply: async () => {
    state.queued.push('chat');
  },
}));
vi.mock('@oneohm/database', () => ({
  messageTemplates: { active: 'active', key: 'key' },
  noticeCustomer: async () => undefined,
  queueCustomerMessage: async () => {
    state.queued.push('template');
  },
}));
vi.mock('@oneohm/domain', () => ({ templateIsOn: () => false }));
vi.mock('drizzle-orm', () => ({ eq: () => undefined }));

import { deliverCare } from './care-deliver';

const tx = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
} as unknown as DatabaseExecutor;
const message = {
  template: 'problem_fixed_check',
  payload: {},
  key: 'k',
  reply: async () => ({ kind: 'text' as const, body: 'x' }),
};

beforeEach(() => {
  state.open = true;
  state.mayChat = false;
  state.queued = [];
});

describe('deliverCare', () => {
  it('follows the template switch by default', async () => {
    const fallback = vi.fn(async () => undefined);
    expect(await deliverCare(tx, { phone: 'p' }, { ...message, fallback })).toBe('fallback');
  });

  it('sends the chat message with the switch off when chatIgnoresSwitch is set', async () => {
    expect(await deliverCare(tx, { phone: 'p' }, { ...message, chatIgnoresSwitch: true })).toBe(
      'chat',
    );
  });

  it('still needs the window when chatIgnoresSwitch is set', async () => {
    state.open = false;
    const fallback = vi.fn(async () => undefined);
    const sent = await deliverCare(
      tx,
      { phone: 'p' },
      { ...message, chatIgnoresSwitch: true, fallback },
    );
    expect(sent).toBe('fallback');
    expect(fallback).toHaveBeenCalled();
  });
});
