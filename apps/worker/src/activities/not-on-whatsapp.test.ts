import type { DatabaseExecutor } from '@oneohm/database';
import { describe, expect, it, vi } from 'vitest';

const fallBackToSms = vi.fn();
vi.mock('@oneohm/database', () => ({
  fallBackToSms: (...args: unknown[]) => fallBackToSms(...args),
}));

import { fallBackNote } from './not-on-whatsapp';

describe('the note on a message WhatsApp refused as "not on WhatsApp"', () => {
  const note = async (did: 'sms' | 'task' | 'none') => {
    fallBackToSms.mockResolvedValueOnce(did);
    return fallBackNote({} as DatabaseExecutor, 'o1', () => ({ title: '', body: '' }));
  };

  it('says only what happened', async () => {
    expect(await note('sms')).toBe('Not on WhatsApp: sent by SMS instead.');
    expect(await note('task')).toBe('Not on WhatsApp: task made to tell them in person.');
    expect(await note('none')).toBe('Not on WhatsApp: not sent.');
  });
});
