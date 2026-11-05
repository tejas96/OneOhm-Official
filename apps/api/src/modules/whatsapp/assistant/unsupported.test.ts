import type { DatabaseExecutor } from '@oneohm/database';
import { describe, expect, it, vi } from 'vitest';
import { CHAT_LISTS } from './chat-words';
import { firstUnsupported, UNSUPPORTED_BURST_SECONDS } from './unsupported';

const fakeDb = () => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  return { db: { update: () => ({ set }) } as unknown as DatabaseExecutor, set };
};

describe('unsupported messages', () => {
  it('replies to the first of a burst only', async () => {
    const { db, set } = fakeDb();
    const now = 1_000_000;
    expect(await firstUnsupported(db, { id: 'c', context: {} }, now)).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
    const noted = { unsupportedAt: now };
    expect(await firstUnsupported(db, { id: 'c', context: noted }, now + 5_000)).toBe(false);
    expect(set).toHaveBeenCalledTimes(1);
    const later = now + (UNSUPPORTED_BURST_SECONDS + 1) * 1000;
    expect(await firstUnsupported(db, { id: 'c', context: noted }, later)).toBe(true);
  });

  it('has the sorry text in English, Marathi and Hindi', () => {
    expect(CHAT_LISTS.en.unsupported).toBe(
      'Sorry, we couldn’t open that. Please send it again as a photo, PDF or text.',
    );
    expect(CHAT_LISTS.mr.unsupported).toContain('PDF');
    expect(CHAT_LISTS.hi.unsupported).toContain('PDF');
  });
});
