import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { chatOf, replies, say, tap, withOnboarding } from '../support/onboarding';
import { uniquePhone } from '../support/sales';
import { postInbound, sendInbound } from '../support/whatsapp';

// Live review A3/A4: a customer message the API could not handle is answered 500 (so Meta
// sends it again) and handled on that retry, with one alert to the chat's people; a late
// tap from an older message changes nothing; the chat's last-inbound time never goes back.

const MINUTE = 60 * 1000;

const lastInboundOf = async (phone: string) => {
  const [chat] = await rows<{ at: Date }>(
    `SELECT last_inbound_at AS at FROM wa_conversations WHERE phone = $1`,
    [phone],
  );
  return chat?.at.getTime();
};

/** How many different messages raised the "could not be handled" alert in this chat. */
const failedAlerts = async (chatId: string) => {
  const found = await rows<{ dedupe_key: string; body: string }>(
    `SELECT dedupe_key, body FROM notifications
      WHERE kind = 'whatsapp_not_handled' AND subject_id = $1`,
    [chatId],
  );
  return found.map((alert) => ({ key: alert.dedupe_key.split(':')[1], body: alert.body }));
};

describe('WhatsApp inbound reliability', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('a message that fails is answered 500, alerted once, and handled when Meta retries', async () => {
    const phone = uniquePhone();
    // The database refuses every reply to this number, so handling the message fails.
    await rows(`CREATE OR REPLACE FUNCTION refuse_reply_${phone.slice(1)}() RETURNS trigger AS $$
      BEGIN IF NEW.recipient = '${phone}' THEN RAISE EXCEPTION 'refused'; END IF; RETURN NEW; END;
      $$ LANGUAGE plpgsql`);
    await rows(`CREATE TRIGGER refuse_reply_${phone.slice(1)} BEFORE INSERT ON outbox
      FOR EACH ROW EXECUTE FUNCTION refuse_reply_${phone.slice(1)}()`);
    const id = `wamid.acceptance-retry-${phone.slice(1)}`;
    const hi = { id, text: 'hi', profileName: 'Retry (test)' };
    try {
      expect((await postInbound(phone, hi)).status).toBe(500);
      // Meta tries again; still failing, still one alert for this message.
      expect((await postInbound(phone, hi)).status).toBe(500);
      const chat = await chatOf(phone);
      const alerts = await failedAlerts(chat.id);
      expect(new Set(alerts.map((alert) => alert.key))).toEqual(new Set([id]));
      expect(alerts[0]?.body).toContain('Retry (test)');
      expect(await replies(phone)).toEqual([]);
    } finally {
      await rows(`DROP TRIGGER refuse_reply_${phone.slice(1)} ON outbox`);
      await rows(`DROP FUNCTION refuse_reply_${phone.slice(1)}()`);
    }
    // The database is fine again: Meta's next retry of the same message is handled.
    await sendInbound(phone, hi);
    const answered = await replies(phone);
    expect(answered.length).toBeGreaterThan(0);
    // A later repeat of that same message is still ignored.
    await sendInbound(phone, hi);
    expect(await replies(phone)).toHaveLength(answered.length);
  });

  it('a tap from an older message, arriving after a newer one, changes nothing', async () => {
    const phone = uniquePhone();
    const now = Date.now();
    await sendInbound(phone, { text: 'hi', at: new Date(now - 2 * MINUTE) });
    await tap(phone, 'ob:language:en');
    const before = await chatOf(phone);
    const said = (await replies(phone)).length;
    const newest = await lastInboundOf(phone);
    // Meta delivers a late tap on the language question, sent a minute before "English".
    await sendInbound(phone, { buttonReply: 'ob:language:mr', at: new Date(now - MINUTE) });
    expect(await chatOf(phone)).toEqual(before);
    expect(await replies(phone)).toHaveLength(said);
    expect(await lastInboundOf(phone)).toBe(newest);
  });

  it('the last inbound time never moves back for a late message', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    const newest = await lastInboundOf(phone);
    await sendInbound(phone, { text: 'hello', at: new Date(Date.now() - 60 * MINUTE) });
    expect(await lastInboundOf(phone)).toBe(newest);
  });
});
