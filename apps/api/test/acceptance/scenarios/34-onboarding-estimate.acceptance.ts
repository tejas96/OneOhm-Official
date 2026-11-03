import { addMonths } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  chatOf,
  choices,
  handOverCount,
  lastReply,
  leadsOf,
  notesOf,
  promisedCall,
  replies,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';

// Part 3, task 5: after the photo step the real pricing engine prices the answers and the
// customer gets an estimate PDF with next-step buttons. A site it cannot price gets no
// number, only an expert; and whatever the customer does next, someone on our side knows.
const DISCLAIMER = 'Estimate — final price in your quotation after a free call or visit';

interface EstimateRow {
  id: string;
  capacity_wp: number;
  module_count: number;
  total_paise: number;
  effective_paise: number;
}

const estimatesOf = (leadId: string) =>
  rows<EstimateRow>(
    `SELECT id, capacity_wp, module_count, total_paise::int AS total_paise,
            effective_paise::int AS effective_paise
       FROM lead_estimates WHERE lead_id = $1`,
    [leadId],
  );

const stageOf = async (leadId: string) =>
  (
    await rows<{ stage: string }>('SELECT stage::text AS stage FROM leads WHERE id = $1', [leadId])
  )[0]?.stage;

/** Onboarding from "hi" to "Send later" at the photo question, for this site. */
async function onboard(phone: string, site = 'home'): Promise<string> {
  await upToSite(phone);
  await tap(phone, `ob:site:${site}`);
  await tap(phone, 'ob:bill:2000_3000');
  await tap(phone, 'ob:roof:rcc');
  await tap(phone, 'ob:floors:1');
  await tap(phone, 'ob:photo:later');
  const [lead] = await leadsOf(phone);
  if (!lead) throw new Error('No lead was made.');
  return lead.id;
}

describe('The instant estimate after onboarding', () => {
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

  it('prices the answers, sends the estimate PDF and leaves the lead New until a person gets in touch', async () => {
    const phone = uniquePhone();
    const leadId = await onboard(phone);

    const [estimate, ...more] = await estimatesOf(leadId);
    expect(more).toEqual([]);
    expect(estimate?.capacity_wp).toBeGreaterThanOrEqual(3000);
    expect(estimate?.module_count).toBeGreaterThan(0);

    const sent = await replies(phone);
    const document = sent.find((reply) => reply.kind === 'document');
    expect(document?.caption).toContain(DISCLAIMER);
    expect(document?.filename).toMatch(/\.pdf$/);
    const file = await fetch(document?.link ?? '');
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toContain('application/pdf');
    expect(choices(sent.at(-1))).toEqual(['ob:done:call', 'ob:person', 'ob:done:notnow']);

    const kw = `${(estimate?.capacity_wp ?? 0) / 1000} kW`;
    const price = formatInr(estimate?.total_paise ?? 0);
    const after = formatInr(estimate?.effective_paise ?? 0);
    expect(await stageOf(leadId)).toBe('new');
    const notes = (await notesOf(leadId)).map((row) => row.note);
    expect(
      notes.some((note) =>
        note.startsWith(`Estimate sent: ${kw}, ${price} (${after} after subsidy)`),
      ),
    ).toBe(true);

    // No tap yet: the owner calls today.
    const [lead] = await leadsOf(phone);
    expect(lead?.next_action_on).toBe(today());
    expect(lead?.next_action_note).toBe(`Call — estimate sent (${kw}, ${price})`);
    expect((await chatOf(phone)).state).toBe('onboard:done');
  });

  it('"Not now" → "In 1 month" sets the next action a month out and thanks them', async () => {
    const phone = uniquePhone();
    await onboard(phone);
    await tap(phone, 'ob:done:notnow');
    expect(choices(await lastReply(phone))).toEqual([
      'ob:done:later:1w',
      'ob:done:later:1m',
      'ob:done:later:3m',
      'ob:person',
    ]);
    await tap(phone, 'ob:done:later:1m');
    const [lead] = await leadsOf(phone);
    expect(lead?.next_action_on).toBe(addMonths(today(), 1));
    expect(lead?.next_action_note).toBe('Check back (customer chose)');
    expect((await lastReply(phone))?.body).toContain('Thank you');
    expect((await chatOf(phone)).state).toBe('onboard:done');
  });

  it('"Call me back" sets a call (today in working hours) and alerts the owner', async () => {
    const phone = uniquePhone();
    await onboard(phone);
    const promise = promisedCall();
    await tap(phone, 'ob:done:call');
    const [lead] = await leadsOf(phone);
    expect(lead?.next_action_on).toBe(promise.day);
    expect(lead?.next_action_note).toBe('Customer asked for a call after the estimate');
    const chat = await chatOf(phone);
    const alerts = await rows<{ user_id: string }>(
      `SELECT user_id FROM notifications WHERE kind = 'whatsapp_callback' AND subject_id = $1`,
      [chat.id],
    );
    expect(alerts.map((alert) => alert.user_id)).toContain(lead?.owner_user_id);
    expect((await lastReply(phone))?.body).toContain(`will call you ${promise.when}`);
  });

  it('a farm gets no number: the expert reply, a hand-over and a call today', async () => {
    const phone = uniquePhone();
    const leadId = await onboard(phone, 'farm');
    expect(await estimatesOf(leadId)).toEqual([]);
    expect((await lastReply(phone))?.body).toContain(
      'Our expert will prepare your price and call you',
    );
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect(await handOverCount(chat.id)).toBe(1);
    const [lead] = await leadsOf(phone);
    expect(lead?.next_action_on).toBe(today());
    expect(lead?.next_action_note).toContain('farm');
    expect((await replies(phone)).some((reply) => reply.kind === 'document')).toBe(false);
  });

  it('with no active panel in the catalog it takes the expert path, never a crash', async () => {
    const off = await rows<{ id: string }>(
      `UPDATE products SET active = false WHERE category = 'panel' AND active RETURNING id`,
    );
    try {
      const phone = uniquePhone();
      const leadId = await onboard(phone);
      expect(await estimatesOf(leadId)).toEqual([]);
      expect((await lastReply(phone))?.body).toContain('Our expert will prepare your price');
      expect((await chatOf(phone)).state).toBe('human');
      expect((await leadsOf(phone))[0]?.next_action_on).toBe(today());
    } finally {
      await rows('UPDATE products SET active = true WHERE id = ANY($1::uuid[])', [
        off.map((row) => row.id),
      ]);
    }
  });

  it('free text after the estimate goes to the owner with a warm reply, never "not understood"', async () => {
    const phone = uniquePhone();
    await onboard(phone);
    await say(phone, 'too costly');
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect(await handOverCount(chat.id)).toBe(1);
    const reply = await lastReply(phone);
    expect(reply?.body).toContain('will reply to you here');
    expect(reply?.body).not.toContain('did not get that');
  });

  it('"Talk to a person" on the estimate hands the chat over', async () => {
    const phone = uniquePhone();
    await onboard(phone);
    await tap(phone, 'ob:person');
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect(await handOverCount(chat.id)).toBe(1);
  });
});
