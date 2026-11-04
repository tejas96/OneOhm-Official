import { describe, expect, it } from 'vitest';
import { templateExtraParts } from './message-templates';

const values = { paidPayload: 'paidother:m1', payToken: 'tok' };

describe('templateExtraParts: payment_reminder has two shapes', () => {
  it('older shape (the switch off): the Pay link alone at position 0, even with the payload queued', () => {
    expect(templateExtraParts('payment_reminder', values).buttons).toEqual([
      { kind: 'url', index: 0, suffix: 'tok' },
    ]);
  });

  it('newer shape (the switch on): I paid another way first, the Pay link at position 1', () => {
    expect(templateExtraParts('payment_reminder', values, true).buttons).toEqual([
      { kind: 'quick_reply', index: 0, payload: 'paidother:m1' },
      { kind: 'url', index: 1, suffix: 'tok' },
    ]);
  });

  it('a message queued before the quick reply existed still sends, the link keeping position 1', () => {
    expect(templateExtraParts('payment_reminder', { payToken: 'tok' }, true).buttons).toEqual([
      { kind: 'url', index: 1, suffix: 'tok' },
    ]);
  });

  it('other templates fail early and clearly on a missing payload', () => {
    expect(() => templateExtraParts('quotation_sent', { acceptPayload: 'a' })).toThrow(
      /askPayload/,
    );
  });
});
