import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf, formLinkOf, photo } from '../support/forms';
import { Session } from '../support/http';
import {
  chatOf,
  lastReply,
  leadsOf,
  notesOf,
  replies,
  say,
  tap,
  withOnboarding,
} from '../support/onboarding';
import { uniquePhone } from '../support/sales';
import { setForm } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// The onboarding form, more edges (audit): Marathi, a campaign code and an ad kept on the lead, every value
// persisted, a bill photo that cannot be opened, and the card link for staff.
const answers = {
  name: 'Sunita More',
  city: 'Satara',
  other_city: '',
  site: 'society',
  bill: '2000_3000',
  roof: 'tin',
  floors: '3',
};
const docsOf = (leadId: string) =>
  rows<{ category: string }>('SELECT category FROM documents WHERE lead_id = $1', [leadId]);
const attribution = (phone: string) =>
  rows<{ campaign_code: string | null; ad_id: string | null }>(
    'SELECT campaign_code, ad_id FROM leads WHERE phone_e164 = $1',
    [phone],
  );

describe('WhatsApp onboarding form: edges', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune', 'Satara'] });
    await setForm('onboarding', FLOW_ID);
  });
  afterAll(async () => {
    await setForm('onboarding', null);
    await restore();
    await closeDb();
  });

  it('Marathi: the form comes in Marathi words; answers land on the lead in English; the reply is Marathi', async () => {
    const phone = uniquePhone();
    await say(phone, 'Hi OneOhm diwali-acc');
    await tap(phone, 'ob:language:mr');
    const form = await flowOf(phone);
    expect(form?.data.heading).not.toBe('Tell us about your home');
    await sendInbound(phone, {
      form: { token: form?.token ?? '', fields: { ...answers, bill_photo: [photo('bill')] } },
    });
    const [lead] = await leadsOf(phone);
    expect(lead).toMatchObject({
      name: 'Sunita More',
      city: 'Satara',
      source: 'whatsapp',
      subsidy_category: 'society',
      floors: 3,
    });
    expect(lead?.estimated_wp).toBe(3000);
    expect(lead?.owner_user_id).toBeTruthy();
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes).toEqual(
      expect.arrayContaining(['Site: Housing society', 'Roof: Tin sheet, 3 floors']),
    );
    expect(notes.some((note) => note.startsWith('Bill: '))).toBe(true);
    expect((await chatOf(phone)).language).toBe('mr');
    expect(/[ऀ-ॿ]/.test((await lastReply(phone))?.body ?? '')).toBe(true);
    expect((await attribution(phone))[0]?.campaign_code).toBe('DIWALI-ACC');
    expect(await docsOf(lead?.id ?? '')).toEqual([{ category: 'electricity_bill' }]);
    expect(await formLinkOf(phone)).toEqual({ kind: 'lead', id: lead?.id });
  });

  it('a click-to-WhatsApp ad is kept on the lead the form makes', async () => {
    const phone = uniquePhone();
    await sendInbound(phone, {
      text: 'Hi',
      referral: { source_id: 'ad-form-1', source_url: 'https://fb.me/f', headline: 'Form ad' },
    });
    await tap(phone, 'ob:language:en');
    const form = await flowOf(phone);
    await sendInbound(phone, {
      form: { token: form?.token ?? '', fields: { ...answers, site: 'home' } },
    });
    expect((await attribution(phone))[0]?.ad_id).toBe('ad-form-1');
    expect(await leadsOf(phone)).toHaveLength(1);
  });

  it('a bill photo that cannot be opened is not filed; the customer is asked for it in the chat and the lead is complete', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    const form = await flowOf(phone);
    const bad = { id: 'sample-wrong-type', file_name: 'bill.pdf', mime_type: 'application/pdf' };
    await sendInbound(phone, {
      form: { token: form?.token ?? '', fields: { ...answers, site: 'home', bill_photo: [bad] } },
    });
    const [lead] = await leadsOf(phone);
    expect(lead?.name).toBe('Sunita More');
    expect(await docsOf(lead?.id ?? '')).toEqual([]);
    const said = (await replies(phone)).map((reply) => reply.body).join('\n');
    expect(said).toMatch(/photo|bill|file/i);
    expect((await chatOf(phone)).state).not.toBe('human');
  });

  it('a farm goes to the expert with no photo, and every answer is still on the lead', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    const form = await flowOf(phone);
    await sendInbound(phone, {
      form: { token: form?.token ?? '', fields: { ...answers, site: 'farm' } },
    });
    const [lead] = await leadsOf(phone);
    expect(lead).toMatchObject({ city: 'Satara', floors: 3 });
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes).toEqual(expect.arrayContaining(['Site: Farm', 'Bill photo: will send later']));
    expect((await chatOf(phone)).state).toBe('human');
  });
});
