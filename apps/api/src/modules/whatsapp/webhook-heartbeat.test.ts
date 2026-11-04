import { describe, expect, it } from 'vitest';
import { WEBHOOK_SILENT_TITLE, webhookLooksSilent } from './webhook-heartbeat';

describe('WhatsApp webhook heartbeat', () => {
  const now = new Date('2026-11-03T10:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it('is silent when nothing came in for 24 hours while messages went out', () => {
    expect(
      webhookLooksSilent(
        { latestInboundAt: hoursAgo(25), latestDeliveredAt: hoursAgo(30), sentSince: 3 },
        now,
      ),
    ).toBe(true);
    expect(
      webhookLooksSilent({ latestInboundAt: null, latestDeliveredAt: null, sentSince: 1 }, now),
    ).toBe(true);
  });

  it('is fine with a recent inbound, or when nothing was sent (a quiet day)', () => {
    expect(
      webhookLooksSilent(
        { latestInboundAt: hoursAgo(23), latestDeliveredAt: null, sentSince: 9 },
        now,
      ),
    ).toBe(false);
    expect(
      webhookLooksSilent(
        { latestInboundAt: hoursAgo(48), latestDeliveredAt: null, sentSince: 0 },
        now,
      ),
    ).toBe(false);
  });

  it('counts delivery receipts as webhooks: sends delivered but no reply is not silent', () => {
    const seen = { latestInboundAt: hoursAgo(48), latestDeliveredAt: hoursAgo(2), sentSince: 5 };
    expect(webhookLooksSilent(seen, now)).toBe(false);
  });

  it('alerts in plain words: what is wrong and what to check', () => {
    expect(WEBHOOK_SILENT_TITLE).toBe('No WhatsApp webhooks for 24 hours — check the connection');
  });
});
