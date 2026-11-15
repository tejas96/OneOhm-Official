import { describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ context: {} as object }));
vi.mock('./chat-store', async (original) => ({
  ...(await original<object>()),
  lockedChat: async () => ({ context: stored.context }),
}));

import { ChatsService } from './chats.service';
import { socialHandle, socialPhone } from './social-reply';

const service = (chat: object, context: object = {}) => {
  stored.context = context;
  const db = { transaction: async (work: (tx: unknown) => unknown) => work({}) };
  const chats = new ChatsService(db as never, {} as never);
  vi.spyOn(chats, 'get').mockResolvedValue({ chat, messages: [] } as never);
  return chats;
};
const actor = { userId: 'u1', fullName: 'Asha Rao', kind: 'staff' } as never;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

describe('Instagram and Facebook chats in the inbox', () => {
  it('refuses a reply when no message or comment can be answered any more', async () => {
    const chat = {
      channel: 'instagram',
      phone: 'ig:1',
      windowOpen: false,
      lastInboundAt: hoursAgo(30),
    };
    const context = { lastDmAt: hoursAgo(30), repliedComments: ['c1'] };
    await expect(service(chat, context).reply(actor, 'c1', 'Hello')).rejects.toThrow(
      'Instagram lets you answer only within 24 hours of their last message, or once to a comment within 7 days.',
    );
    await expect(
      service({ ...chat, channel: 'messenger', phone: 'fb:1' }, context).reply(
        actor,
        'c1',
        'Hello',
      ),
    ).rejects.toThrow('Facebook lets you answer only within 24 hours');
  });

  it('has no assistant to give the chat back to', async () => {
    await expect(service({ channel: 'messenger' }).release(actor, 'c1')).rejects.toThrow(
      'Instagram and Facebook chats have no assistant.',
    );
  });

  it('does not open a chat by a social handle', async () => {
    await expect(new ChatsService({} as never, {} as never).open(actor, 'ig:1')).rejects.toThrow();
  });

  it('keeps the person id in the chat key', () => {
    expect(socialPhone('instagram', '17841')).toBe('ig:17841');
    expect(socialHandle('fb:99')).toEqual({ channel: 'messenger', id: '99' });
    expect(socialHandle('+919876543210')).toBeNull();
  });
});
