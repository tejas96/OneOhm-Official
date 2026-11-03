import { describe, expect, it } from 'vitest';
import { CHAT_WINDOW_CLOSED, chatWindowOpen, tokenExpiredNotice } from './send-checks';

const now = new Date('2026-11-03T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600_000);

describe('chatWindowOpen', () => {
  it('is open within 23 hours of the customer writing', () => {
    expect(chatWindowOpen(hoursAgo(1), now)).toBe(true);
    expect(chatWindowOpen(hoursAgo(22.9), now)).toBe(true);
  });

  it('is closed after 23 hours, an hour before Meta closes it', () => {
    expect(chatWindowOpen(hoursAgo(23.1), now)).toBe(false);
    expect(chatWindowOpen(hoursAgo(30), now)).toBe(false);
  });

  it('is closed when the customer never wrote', () => {
    expect(chatWindowOpen(null, now)).toBe(false);
  });

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
