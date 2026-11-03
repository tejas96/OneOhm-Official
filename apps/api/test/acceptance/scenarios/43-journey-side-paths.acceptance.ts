import { addMonths } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import * as J from '../support/journey';
import { NIGHT, NOON, nudgesTo, runNudges, silentFor } from '../support/nudges';
import {
  chatOf,
  choices,
  handOverAlerts,
  handOverCount,
  lastReply,
  leadsOf,
  replies,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';

// The journey's side paths in the chat (a-e), so one place proves every way a WhatsApp
// customer can go: a site we cannot price, "Not now", typed words after the estimate, a
// customer who goes quiet before and after the lead exists, and everyone on leave.
const TAG = 'journey side paths (test)';

/** From the site question to the photo question's "Send later": the estimate follows. */
async function fromSite(phone: string, site = 'home'): Promise<string> {
  for (const id of [`ob:site:${site}`, 'ob:bill:2000_3000', 'ob:roof:rcc', 'ob:floors:1'])
    await tap(phone, id);
  await tap(phone, 'ob:photo:later');
  const [lead] = await leadsOf(phone);
  return lead?.id ?? '';
}
const estimatesOf = (leadId: string) =>
  rows('SELECT id FROM lead_estimates WHERE lead_id = $1', [leadId]);

describe('The journey side paths in the chat', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, {
      enabled: true,
      serviceCities: ['Pune'],
      nudgeAfterHours: 3,
    });
  });
  afterAll(async () => {
    await rows('DELETE FROM leave_requests WHERE reason = $1', [TAG]);
    await restore();
    await closeDb();
  });

  it('a) expert path: a farm gets no number, a hand-over to the owner and a call today', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    const leadId = await fromSite(phone, 'farm');
    expect(await estimatesOf(leadId)).toEqual([]);
    expect((await replies(phone)).some((reply) => reply.kind === 'document')).toBe(false);
    expect((await lastReply(phone))?.body).toContain('Our expert will prepare your price');
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect(await handOverCount(chat.id)).toBe(1);
    const lead = await J.leadState(leadId);
    expect((await handOverAlerts(chat.id)).map((alert) => alert.user_id)).toContain(
      lead.owner_user_id,
    );
    expect(lead.next_action_on).toBe(today());
    expect(lead.next_action_note).toContain('farm');
  });

  it('b) "Not now" → "In 1 month" sets the next action a month out, with a history note', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    const leadId = await fromSite(phone);
    await tap(phone, 'ob:done:notnow');
    expect(choices(await lastReply(phone))).toEqual([
      'ob:done:later:1w',
      'ob:done:later:1m',
      'ob:done:later:3m',
      'ob:person',
    ]);
    await tap(phone, 'ob:done:later:1m');
    expect(await J.leadState(leadId)).toMatchObject({
      next_action_on: addMonths(today(), 1),
      next_action_note: 'Check back (customer chose)',
    });
    expect((await J.historyOf(leadId)).at(-1)).toBe(
      'Not now after the estimate: check back in 1 month',
    );
    expect((await lastReply(phone))?.body).toContain('Thank you');
  });

  it('c) typed words after the estimate: a warm hand-over and an alert to the owner', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    const leadId = await fromSite(phone);
    await say(phone, 'too costly for me');
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect(await handOverCount(chat.id)).toBe(1);
    const owner = (await J.leadState(leadId)).owner_user_id;
    expect((await handOverAlerts(chat.id)).map((alert) => alert.user_id)).toContain(owner);
    const reply = await lastReply(phone);
    expect(reply?.body).toContain('will reply to you here');
    expect(reply?.body).not.toContain('did not get that');
  });

  it('d) a stall before the city: one nudge and a lead "Not given" with a call; nothing more', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await tap(phone, 'ob:name:yes');
    expect(await leadsOf(phone)).toEqual([]);
    await silentFor(phone, 4);
    await runNudges(admin, NOON);
    const [lead, ...more] = await leadsOf(phone);
    expect(more).toEqual([]);
    expect(lead).toMatchObject({
      city: 'Not given',
      source: 'whatsapp',
      next_action_on: today(),
      next_action_note: 'Call — stopped at city question',
    });
    expect(lead?.owner_user_id).toBeTruthy();
    expect(choices((await nudgesTo(phone))[0])).toEqual(['ob:continue', 'ob:person']);
    // They come back, give the city, and go quiet again: the same lead, no second nudge.
    await tap(phone, 'ob:continue');
    await tap(phone, 'ob:city:Pune');
    expect(await leadsOf(phone)).toEqual([expect.objectContaining({ id: lead?.id, city: 'Pune' })]);
    await silentFor(phone, 4);
    await runNudges(admin, NOON);
    expect(await nudgesTo(phone)).toHaveLength(1);
  });

  it('d) a stall after the lead: no message at night, one nudge in working hours, never two', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await silentFor(phone, 4, NIGHT);
    await runNudges(admin, NIGHT);
    expect(await nudgesTo(phone)).toHaveLength(0);
    await silentFor(phone, 4);
    await runNudges(admin, NOON);
    await runNudges(admin, NOON);
    expect(await nudgesTo(phone)).toHaveLength(1);
    const [lead] = await leadsOf(phone);
    expect(lead).toMatchObject({
      next_action_on: today(),
      next_action_note: 'Call — stopped at site question',
    });
  });

  it('e) everyone who sells is on leave: the desk (admin) owns the lead and sales is alerted', async () => {
    for (const id of await J.sellers())
      await rows(
        `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_day, half_days, status, reason)
         VALUES ($1, 'casual', $2, $2, false, 2, 'approved', $3)`,
        [id, today(), TAG],
      );
    try {
      const phone = uniquePhone();
      await upToSite(phone);
      const [lead] = await leadsOf(phone);
      expect(lead?.owner_user_id).toBe(admin.userId);
      const told = await J.alerted('lead_needs_owner', lead?.id ?? '');
      for (const id of await J.holdersOf('leads.manage')) expect(told).toContain(id);
      expect((await chatOf(phone)).state).toBe('onboard:site');
    } finally {
      await rows('DELETE FROM leave_requests WHERE reason = $1', [TAG]);
    }
  });
});
