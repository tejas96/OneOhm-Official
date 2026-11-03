import { describe, expect, it } from 'vitest';
import { webhookLooksSilent } from './webhook-heartbeat';

describe('WhatsApp webhook heartbeat', () => {
  const now = new Date('2026-11-03T10:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it('is silent when nothing came in for 24 hours while messages went out', () => {
    expect(webhookLooksSilent({ latestInboundAt: hoursAgo(25), sentSince: 3 }, now)).toBe(true);
    expect(webhookLooksSilent({ latestInboundAt: null, sentSince: 1 }, now)).toBe(true);
  });

  it('is fine with a recent inbound, or when nothing was sent (a quiet day)', () => {
    expect(webhookLooksSilent({ latestInboundAt: hoursAgo(23), sentSince: 9 }, now)).toBe(false);
    expect(webhookLooksSilent({ latestInboundAt: hoursAgo(48), sentSince: 0 }, now)).toBe(false);
  });
});
