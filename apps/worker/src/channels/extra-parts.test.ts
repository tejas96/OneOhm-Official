import { describe, expect, it } from 'vitest';
import { templateExtraParts } from './message-templates';

describe('templateExtraParts: payment_reminder', () => {
  it('puts I paid another way first and the pay link after it', () => {
    expect(
      templateExtraParts('payment_reminder', { paidPayload: 'paidother:m1', payToken: 'tok' })
        .buttons,
    ).toEqual([
      { kind: 'quick_reply', index: 0, payload: 'paidother:m1' },
      { kind: 'url', index: 1, suffix: 'tok' },
    ]);
  });

  it('a message queued before the quick reply existed still sends, the link keeping its place', () => {
    expect(templateExtraParts('payment_reminder', { payToken: 'tok' }).buttons).toEqual([
      { kind: 'url', index: 1, suffix: 'tok' },
    ]);
  });
});
