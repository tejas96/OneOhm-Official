import { describe, expect, it, vi } from 'vitest';
import type { DatabaseExecutor } from './client';
import { fallbackOf, queueFallback, withFallback } from './message-fallback';

const asked = vi.hoisted(() => [] as unknown[][]);
vi.mock('./customer-message', () => ({
  queueCustomerMessageAs: async (...args: unknown[]) => {
    asked.push(args.slice(1));
    return 'whatsapp';
  },
}));

describe('a chat message with a template fallback', () => {
  it('carries the template and its values beside the chat message', () => {
    const payload = withFallback({ kind: 'text', body: 'Hi' }, 'payment_received', { a: '1' }, 'k');
    expect(payload).toEqual({
      kind: 'text',
      body: 'Hi',
      fallback: { template: 'payment_received', payload: { a: '1' }, dedupeKey: 'k' },
    });
    expect(fallbackOf(payload)?.template).toBe('payment_received');
  });

  it('leaves the dedupe key out when none is given', () => {
    expect(withFallback({}, 't', {}).fallback).not.toHaveProperty('dedupeKey');
  });

  it('is absent from a plain payload, so nothing is queued', async () => {
    expect(fallbackOf({ kind: 'text', body: 'Hi' })).toBeNull();
    expect(fallbackOf(null)).toBeNull();
    const row = { recipient: '+91', dedupeKey: 'k', payload: { kind: 'text' } };
    expect(await queueFallback({} as DatabaseExecutor, row)).toBeNull();
  });
});

describe('queueing a fallback', () => {
  it('uses the fallback key, else the row key plus :fallback', async () => {
    const db = {} as DatabaseExecutor;
    const base = { recipient: '+91', dedupeKey: 'row' };
    await queueFallback(db, { ...base, payload: withFallback({}, 't', { a: '1' }) });
    await queueFallback(db, { ...base, payload: withFallback({}, 't', { a: '1' }, 'own') });
    expect(asked).toEqual([
      ['+91', 't', { a: '1' }, 'row:fallback'],
      ['+91', 't', { a: '1' }, 'own'],
    ]);
  });
});
