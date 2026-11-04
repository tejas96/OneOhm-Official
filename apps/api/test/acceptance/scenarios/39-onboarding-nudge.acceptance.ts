import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { NIGHT, NOON, NUDGE_DAY, nudgesTo, runNudges, silentFor } from '../support/nudges';
import {
  chatOf,
  choices,
  lastReply,
  leadsOf,
  notesOf,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Part 3, task 7: one gentle nudge when a customer stops halfway, and no silent paths: a
// chat that stalls before a lead exists gets a lead (city "Not given") with a call today.
// The job is run by hand with a chosen clock; the timer is off in this suite.

describe('Onboarding nudge and stalled leads', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  const withNudge = async (hours: number) => {
    await restore();
    restore = await withOnboarding(admin, {
      enabled: true,
      serviceCities: ['Pune'],
      nudgeAfterHours: hours,
    });
  };
  const silent = silentFor;
  const run = (now = NOON) => runNudges(admin, now);
  const nudges = nudgesTo;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
    await withNudge(3);
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('nudges a chat silent 4 hours once, with Continue and Talk to a person', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    const [lead] = await leadsOf(phone);
    await silent(phone, 4);
    await run();
    const [nudge] = await nudges(phone);
    expect(choices(nudge)).toEqual(['ob:continue', 'ob:person']);
    expect(((await chatOf(phone)).ob as { nudgedAt?: string }).nudgedAt).toBeTruthy();
    const [after] = await leadsOf(phone);
    expect(after).toMatchObject({ id: lead?.id, next_action_on: NUDGE_DAY });
    expect(after?.next_action_note).toBe('Call — stopped at site question');
    expect(
      (await notesOf(lead?.id ?? '')).some((n) => n.note.includes('stopped at the site')),
    ).toBe(true);
    await run();
    expect(await nudges(phone)).toHaveLength(1);
  });

  it('nudges in the chat language', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:mr');
    await silent(phone, 4);
    await run();
    expect((await lastReply(phone))?.body).toBe('पुढे जायचे का? फक्त एक मिनिट लागेल.');
  });

  it('does nothing at 2 hours; at 25 hours sends no message but still makes the lead', async () => {
    const early = uniquePhone();
    await upToSite(early);
    await silent(early, 2);
    const late = uniquePhone();
    await say(late, 'hi');
    await tap(late, 'ob:language:en');
    await silent(late, 25);
    await run();
    expect(await nudges(early)).toHaveLength(0);
    expect(await nudges(late)).toHaveLength(0);
    const [lead] = await leadsOf(late);
    expect(lead).toMatchObject({ city: 'Not given', next_action_on: today() });
    expect(lead?.next_action_note).toBe('Call — stopped at name question');
  });

  it('sends no message at night, and never a second nudge', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await silent(phone, 4, NIGHT);
    await run(NIGHT);
    expect(await nudges(phone)).toHaveLength(0);
    await silent(phone, 4);
    await run(NOON);
    expect(await nudges(phone)).toHaveLength(1);
    // The customer comes back, answers, goes quiet again: still only the one nudge.
    await tap(phone, 'ob:site:home');
    await silent(phone, 4);
    await run(NOON);
    expect(await nudges(phone)).toHaveLength(1);
  });

  it('makes a lead for a chat stalled at the name question, also with nudges off', async () => {
    await withNudge(0);
    try {
      const phone = uniquePhone();
      await say(phone, 'hi');
      await tap(phone, 'ob:language:en');
      expect(await leadsOf(phone)).toEqual([]);
      await silent(phone, 2);
      await run();
      expect(await leadsOf(phone)).toEqual([]);
      await silent(phone, 4);
      await run();
      const [lead] = await leadsOf(phone);
      expect(lead).toMatchObject({
        city: 'Not given',
        source: 'whatsapp',
        next_action_on: today(),
      });
      expect(lead?.next_action_note).toBe('Call — stopped at name question');
      expect(await nudges(phone)).toHaveLength(0);
    } finally {
      await withNudge(3);
    }
  });

  it('files a held bill on the lead made for a stalled chat', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await sendInbound(phone, {
      media: { type: 'image', fileId: 'bill-n', mimeType: 'image/jpeg' },
    });
    await silent(phone, 4);
    await run();
    const [lead] = await leadsOf(phone);
    const docs = await rows(`SELECT id FROM documents WHERE lead_id = $1`, [lead?.id]);
    expect(docs).toHaveLength(1);
    expect(await chatOf(phone)).toMatchObject({ ob: { answers: { photo: 'sent' } } });
  });

  it('asks the current question again when Continue is tapped', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await silent(phone, 4);
    await run();
    await sendInbound(phone, { buttonReply: 'ob:continue' });
    expect(choices(await lastReply(phone))).toContain('ob:site:home');
    expect((await chatOf(phone)).state).toBe('onboard:site');
  });
});
