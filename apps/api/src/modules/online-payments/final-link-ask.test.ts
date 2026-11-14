import { withFallback } from '@oneohm/database';
import { describe, expect, it } from 'vitest';
import { ASKED_STATUSES, payFallback } from './final-link-ask';

describe('the final instalment pay ask', () => {
  it('counts only sent or pending chat rows as already asked, never failed or skipped ones', () => {
    expect([...ASKED_STATUSES].sort()).toEqual(['pending', 'sent']);
    expect(ASKED_STATUSES).not.toContain('failed');
    expect(ASKED_STATUSES).not.toContain('skipped');
  });

  it('falls back to the payment_link template, queued once under the milestone-due key', () => {
    const payload = { link: 'https://pay.example/x', amount: '₹10,000' };
    const fallback = payFallback('m1', payload);
    expect(fallback).toEqual({ template: 'payment_link', payload, dedupeKey: 'milestone_due:m1' });
    const reply = withFallback({ kind: 'buttons' }, fallback.template, payload, fallback.dedupeKey);
    expect(reply.fallback).toEqual(fallback);
  });
});
