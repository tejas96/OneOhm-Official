import { describe, expect, it } from 'vitest';
import {
  payoutNeverReached,
  payoutPhase,
  payoutRank,
  payoutStuck,
  payoutTransition,
  stuckAfterMinutes,
} from './payout-transitions';

describe('payout status order', () => {
  it('ranks queued below pending below processing below processed below reversed', () => {
    expect(payoutRank('queued')).toBeLessThan(payoutRank('pending'));
    expect(payoutRank('pending')).toBeLessThan(payoutRank('processing'));
    expect(payoutRank('processing')).toBeLessThan(payoutRank('processed'));
    expect(payoutRank('processed')).toBeLessThan(payoutRank('reversed'));
  });

  it('moves an open payout forward and ignores a step back', () => {
    expect(payoutTransition('queued', 'processing')).toBe('apply');
    expect(payoutTransition('processing', 'queued')).toBe('stale');
    expect(payoutTransition('processing', 'processing')).toBe('repeat');
    expect(payoutTransition('processing', 'pending')).toBe('stale');
  });

  it('lets an open payout fail or finish from any open step', () => {
    for (const from of ['queued', 'pending', 'processing'] as const) {
      expect(payoutTransition(from, 'failed')).toBe('apply');
      expect(payoutTransition(from, 'rejected')).toBe('apply');
      expect(payoutTransition(from, 'cancelled')).toBe('apply');
      expect(payoutTransition(from, 'processed')).toBe('apply');
    }
  });

  it('lets only a reversal follow a processed payout', () => {
    expect(payoutTransition('processed', 'reversed')).toBe('apply');
    expect(payoutTransition('processed', 'processing')).toBe('stale');
    expect(payoutTransition('processed', 'failed')).toBe('stale');
    expect(payoutTransition('processed', 'processed')).toBe('repeat');
  });

  it('treats a reversal as final', () => {
    for (const late of ['queued', 'processing', 'processed', 'failed'] as const)
      expect(payoutTransition('reversed', late)).toBe('stale');
  });

  it('keeps a failed payout failed unless RazorpayX later says processed', () => {
    for (const dead of ['failed', 'cancelled', 'rejected'] as const) {
      expect(payoutTransition(dead, 'processed')).toBe('apply');
      expect(payoutTransition(dead, 'processing')).toBe('stale');
      expect(payoutTransition(dead, 'queued')).toBe('stale');
      expect(payoutTransition(dead, 'reversed')).toBe('stale');
    }
    expect(payoutTransition('failed', 'rejected')).toBe('stale');
  });
});

describe('payout phase', () => {
  it('says sending until RazorpayX has given an id', () => {
    expect(payoutPhase('queued', false)).toBe('sending');
    expect(payoutPhase('queued', true)).toBe('on_its_way');
    expect(payoutPhase('processing', true)).toBe('on_its_way');
  });

  it('names the final stages', () => {
    expect(payoutPhase('processed', true)).toBe('paid');
    expect(payoutPhase('reversed', true)).toBe('came_back');
    for (const dead of ['failed', 'cancelled', 'rejected'] as const)
      expect(payoutPhase(dead, false)).toBe('failed');
  });
});

describe('payout timing', () => {
  const start = new Date('2026-11-05T10:00:00Z');
  const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

  it('waits 30 minutes for IMPS and 4 hours for NEFT', () => {
    expect(stuckAfterMinutes('IMPS')).toBe(30);
    expect(stuckAfterMinutes('NEFT')).toBe(240);
    expect(payoutStuck('IMPS', start, after(30))).toBe(false);
    expect(payoutStuck('IMPS', start, after(31))).toBe(true);
    expect(payoutStuck('NEFT', start, after(200))).toBe(false);
    expect(payoutStuck('NEFT', start, after(241))).toBe(true);
  });

  it('says a payout did not reach RazorpayX after 15 minutes', () => {
    expect(payoutNeverReached(start, after(15))).toBe(false);
    expect(payoutNeverReached(start, after(16))).toBe(true);
  });
});
