import { describe, expect, it } from 'vitest';
import { CHAT_WINDOW_CLOSED, smsCanStandIn, tokenExpiredNotice } from './send-checks';

const now = new Date('2026-11-03T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600_000);

describe('chat window closed', () => {
  it('says plainly why the message failed', () => {
    expect(CHAT_WINDOW_CLOSED.toLowerCase()).toContain('chat window closed');
  });
});

describe('tokenExpiredNotice', () => {
  it('alerts once a day', () => {
    const notice = tokenExpiredNotice(now);
    expect(notice.title).toBe('WhatsApp token expired — messages are not going out');
    expect(notice.dedupeKey).toBe('whatsapp_token_expired:2026-11-03');
    expect(tokenExpiredNotice(hoursAgo(1)).dedupeKey).toBe(notice.dedupeKey);
    expect(tokenExpiredNotice(hoursAgo(13)).dedupeKey).not.toBe(notice.dedupeKey);
  });
});

describe('smsCanStandIn', () => {
  it('lets customer messages fall back to SMS but never staff ones', () => {
    expect(smsCanStandIn('payment_reminder')).toBe(true);
    expect(smsCanStandIn('staff_welcome')).toBe(false);
    expect(smsCanStandIn('staff_daily_digest')).toBe(false);
  });
});
