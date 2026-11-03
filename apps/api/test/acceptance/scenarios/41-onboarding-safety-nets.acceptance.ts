import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  chatOf,
  leadsOf,
  replies,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { catalog, uniquePhone } from '../support/sales';
import { sendInbound, sendStatus } from '../support/whatsapp';

// Part 3, final fixes: the safety nets of the onboarding hold at the edges. A lead closed
// halfway, a panel taken off sale, a file WhatsApp could not deliver, a second "Call me
// back", quick ad messages and a lead without a real name never leave a silent path.

/** From the site question on, a home site to "Send later": the estimate follows. */
async function finishFromSite(phone: string): Promise<void> {
  await tap(phone, 'ob:site:home');
  await tap(phone, 'ob:bill:2000_3000');
  await tap(phone, 'ob:roof:rcc');
  await tap(phone, 'ob:floors:1');
  await tap(phone, 'ob:photo:later');
}

const alertsOf = (kind: string, subjectId: string) =>
  rows<{ user_id: string; body: string }>(
    `SELECT user_id, body FROM notifications WHERE kind = $1 AND subject_id = $2`,
    [kind, subjectId],
  );

describe('Onboarding safety nets', () => {
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

  it('a lead closed halfway: the end of the flow makes a new one, prices it and tells its owner', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    const [closed] = await leadsOf(phone);
    await rows(`UPDATE leads SET stage = 'lost' WHERE id = $1`, [closed?.id]);
    await finishFromSite(phone);
    const fresh = (await leadsOf(phone)).find((lead) => lead.id !== closed?.id);
    expect(fresh?.owner_user_id).toBeTruthy();
    const estimates = await rows(`SELECT id FROM lead_estimates WHERE lead_id = $1`, [fresh?.id]);
    expect(estimates).toHaveLength(1);
    expect((await replies(phone)).some((reply) => reply.kind === 'document')).toBe(true);
    const told = await alertsOf('lead_assigned', fresh?.id ?? '');
    expect(told.map((alert) => alert.user_id)).toContain(fresh?.owner_user_id);
  });

  it('a chosen panel taken off sale is never priced: the suggested active one is', async () => {
    const { dcrPanel, nonDcrPanel } = await catalog(admin);
    const back = await withOnboarding(admin, { panelProductIds: { individual: nonDcrPanel } });
    await rows(`UPDATE products SET active = false WHERE id = $1`, [nonDcrPanel]);
    try {
      const phone = uniquePhone();
      await upToSite(phone);
      await finishFromSite(phone);
      const [lead] = await leadsOf(phone);
      const [estimate] = await rows<{ panel: string }>(
        `SELECT priced->>'panelProductId' AS panel FROM lead_estimates WHERE lead_id = $1`,
        [lead?.id],
      );
      expect(estimate?.panel).toBe(dcrPanel);
    } finally {
      await rows(`UPDATE products SET active = true WHERE id = $1`, [nonDcrPanel]);
      await back();
    }
  });

  it('an estimate WhatsApp could not deliver tells the owner once to send it again', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await finishFromSite(phone);
    const wamid = `wamid.file-${phone}`;
    await rows(
      `UPDATE outbox SET status = 'sent', provider_message_id = $2, delivery_status = 'sent'
        WHERE recipient = $1 AND template = 'session:document'`,
      [phone, wamid],
    );
    await sendStatus(wamid, 'failed');
    await sendStatus(wamid, 'failed');
    const chat = await chatOf(phone);
    const [lead] = await leadsOf(phone);
    const told = await alertsOf('whatsapp_file_failed', chat.id);
    expect(told).toHaveLength(1);
    expect(told[0]?.user_id).toBe(lead?.owner_user_id);
    expect(told[0]?.body).toBe(
      `A file could not be sent to Acceptance Customer (test) (${phone}) on WhatsApp — please send it again.`,
    );
    // A failed text reply is the usual delivery failure, not a file to send again.
    const text = `wamid.text-${phone}`;
    await rows(
      `UPDATE outbox SET status = 'sent', provider_message_id = $2, delivery_status = 'sent'
        WHERE id = (SELECT id FROM outbox WHERE recipient = $1 AND template = 'session:text'
                     ORDER BY created_at LIMIT 1)`,
      [phone, text],
    );
    await sendStatus(text, 'failed');
    expect(await alertsOf('whatsapp_file_failed', chat.id)).toHaveLength(1);
  });

  it('"Call me back" twice the same day alerts the owner once', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await finishFromSite(phone);
    await tap(phone, 'ob:done:call');
    await tap(phone, 'ob:done:call');
    const chat = await chatOf(phone);
    expect(await alertsOf('whatsapp_callback', chat.id)).toHaveLength(1);
  });

  it('quick ad messages before the lead never wipe the onboarding answers', async () => {
    const phones = Array.from({ length: 5 }, () => uniquePhone());
    for (const phone of phones) {
      await say(phone, 'hi');
      await tap(phone, 'ob:language:en');
    }
    const ad = { source_id: 'ad-race', source_url: 'https://fb.me/r', headline: 'Solar' };
    await Promise.all(
      phones.flatMap((phone) => [
        sendInbound(phone, { buttonReply: 'ob:name:yes' }),
        // "hi" re-asks the current question, so only a lost write could change the answers.
        sendInbound(phone, { text: 'hi', referral: ad }),
      ]),
    );
    for (const phone of phones) {
      const [chat] = await rows<{ ob: { answers: Record<string, unknown> }; entry: unknown }>(
        `SELECT context->'ob' AS ob, context->'entry' AS entry FROM wa_conversations
          WHERE phone = $1`,
        [phone],
      );
      expect(chat?.ob.answers, phone).toMatchObject({ language: 'en' });
      expect(chat?.ob.answers.name, phone).toBe('Acceptance Customer (test)');
      expect(chat?.entry, phone).toMatchObject({ adId: 'ad-race' });
    }
  });

  it('a lead named only "WhatsApp enquiry" still gets the name question', async () => {
    const phone = uniquePhone();
    const unnamed = { profileName: null };
    await sendInbound(phone, { text: 'hi', ...unnamed });
    await sendInbound(phone, { buttonReply: 'ob:person', ...unnamed });
    expect((await leadsOf(phone))[0]?.name).toBe('WhatsApp enquiry');
    // Staff hand the chat back at the language question.
    await rows(`UPDATE wa_conversations SET state = 'onboard:language' WHERE phone = $1`, [phone]);
    await sendInbound(phone, { buttonReply: 'ob:language:en', ...unnamed });
    expect((await chatOf(phone)).state).toBe('onboard:name');
  });
});
