import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { optionIds } from '../support/care';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf, OLD, photo } from '../support/forms';
import { Session } from '../support/http';
import {
  chatOf,
  choices,
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

// The new-lead onboarding form (Part 1 §3): after the language tap a WhatsApp form replaces the one-by-one
// questions when it is published; its answers go through the same steps as the chat; with no flow id, or if
// the customer types instead, the chat path is unchanged.
const PROFILE = 'Acceptance Customer (test)';
const answers = {
  name: 'Asha Patil',
  city: 'Pune',
  other_city: '',
  site: 'home',
  bill: '2000_3000',
  roof: 'rcc',
  floors: '2',
};
const hasEstimate = async (phone: string) =>
  (await replies(phone)).some((reply) => reply.kind === 'document');
const docsOf = (leadId: string) =>
  rows<{ category: string }>('SELECT category FROM documents WHERE lead_id = $1', [leadId]);

/** "hi", English: the form (or, with no flow id, the name question) comes next. */
async function toLanguage(phone: string) {
  await say(phone, 'hi');
  await tap(phone, 'ob:language:en');
}

describe('WhatsApp onboarding form', () => {
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

  it('sends the form after the language tap, with the settings as its options', async () => {
    const phone = uniquePhone();
    await toLanguage(phone);
    const form = await flowOf(phone);
    expect(form).toMatchObject({ flowId: FLOW_ID, screen: 'ABOUT_YOU', button: 'Open form' });
    expect(form?.data.name_init).toBe(PROFILE);
    expect(optionIds(form?.data.city_options)).toEqual(['Pune', 'Satara', '__other__']);
    expect(form?.fallbackText).toBeTruthy();
    expect((await chatOf(phone)).state).toBe('onboard:name');
    expect(await leadsOf(phone)).toEqual([]);
  });

  it('applies the answers like the chat: lead, owner, notes, floors, bill photo and the estimate', async () => {
    const phone = uniquePhone();
    await toLanguage(phone);
    const form = await flowOf(phone);
    await sendInbound(phone, {
      form: { token: form?.token ?? '', fields: { ...answers, bill_photo: [photo('bill')] } },
    });
    const [lead, ...more] = await leadsOf(phone);
    expect(more).toEqual([]);
    expect(lead).toMatchObject({
      name: 'Asha Patil',
      city: 'Pune',
      source: 'whatsapp',
      subsidy_category: 'individual',
      estimated_wp: 3000,
      floors: 2,
    });
    expect(lead?.owner_user_id).toBeTruthy();
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes).toContain('Roof: RCC, 2 floors');
    expect(await docsOf(lead?.id ?? '')).toEqual([{ category: 'electricity_bill' }]);
    // Staff see the bill on the form's card (a machine name like "<uuid>.jpg" becomes "Bill photo").
    const [card] = await rows<{ files: number; name: string }>(
      `select jsonb_array_length(m.data->'form'->'fileIds') as files, d.name
         from wa_messages m join wa_conversations c on c.id = m.conversation_id
         join documents d on d.id = (m.data->'form'->'fileIds'->>0)::uuid
        where c.phone = $1 and m.kind = 'form'`,
      [phone],
    );
    expect(card).toMatchObject({ files: 1, name: expect.stringMatching(/^(Bill photo|bill)\./) });
    expect((await chatOf(phone)).state).toBe('onboard:done');
    expect(await hasEstimate(phone)).toBe(true);
    expect(choices(await lastReply(phone))).toContain('ob:done:call');

    // The same form cannot answer twice.
    await sendInbound(phone, { form: { token: form?.token ?? '', fields: answers } });
    expect((await lastReply(phone))?.body).toBe(OLD);
    expect(await leadsOf(phone)).toHaveLength(1);
  });

  it('"Other city" takes the typed city; no photo is "send later"; a farm goes to the expert', async () => {
    const phone = uniquePhone();
    await toLanguage(phone);
    const form = await flowOf(phone);
    await sendInbound(phone, {
      form: {
        token: form?.token ?? '',
        fields: { ...answers, city: '__other__', other_city: 'Kolhapur', site: 'farm' },
      },
    });
    const [lead] = await leadsOf(phone);
    expect(lead?.city).toBe('Kolhapur');
    expect((await notesOf(lead?.id ?? '')).map((row) => row.note)).toContain(
      'Bill photo: will send later',
    );
    expect(await hasEstimate(phone)).toBe(false);
    expect((await lastReply(phone))?.body).toContain('Our expert will prepare your price');
    expect((await chatOf(phone)).state).toBe('human');
  });

  it('Other without a typed city: the chat asks the city; typed answers work beside an open form', async () => {
    const phone = uniquePhone();
    await toLanguage(phone);
    const form = await flowOf(phone);
    await sendInbound(phone, {
      form: { token: form?.token ?? '', fields: { ...answers, city: '__other__' } },
    });
    expect((await chatOf(phone)).state).toBe('onboard:city');
    expect((await lastReply(phone))?.body).toContain('type your city');
    expect(await leadsOf(phone)).toEqual([]);
    await say(phone, 'Nashik');
    expect((await leadsOf(phone))[0]?.city).toBe('Nashik');
    expect((await chatOf(phone)).state).toBe('onboard:done');
  });

  it('typing instead of using the form continues the chat steps, and the form is then old', async () => {
    const phone = uniquePhone();
    await toLanguage(phone);
    const form = await flowOf(phone);
    await tap(phone, 'ob:name:yes');
    await tap(phone, 'ob:city:Pune');
    expect((await chatOf(phone)).state).toBe('onboard:site');
    await tap(phone, 'ob:site:home');
    await tap(phone, 'ob:bill:2000_3000');
    await tap(phone, 'ob:roof:rcc');
    await tap(phone, 'ob:floors:1');
    await tap(phone, 'ob:photo:later');
    expect((await chatOf(phone)).state).toBe('onboard:done');
    await sendInbound(phone, { form: { token: form?.token ?? '', fields: answers } });
    expect((await lastReply(phone))?.body).toBe(OLD);
    expect(await leadsOf(phone)).toHaveLength(1);
  });

  it('with no flow id the chat asks the name as today', async () => {
    await setForm('onboarding', null);
    try {
      const phone = uniquePhone();
      await toLanguage(phone);
      expect((await replies(phone)).some((reply) => reply.kind === 'flow')).toBe(false);
      const name = await lastReply(phone);
      expect(name?.body).toContain(PROFILE);
      expect(choices(name)).toEqual(['ob:name:yes', 'ob:name:change', 'ob:person']);
    } finally {
      await setForm('onboarding', FLOW_ID);
    }
  });

  it('a form token we never issued is "old" and changes nothing', async () => {
    const phone = uniquePhone();
    await toLanguage(phone);
    await sendInbound(phone, { form: { token: 'not-ours', fields: answers } });
    expect(choices(await lastReply(phone))).toContain('ob:name:yes');
    expect((await replies(phone)).some((reply) => reply.body === OLD)).toBe(true);
    expect(await leadsOf(phone)).toEqual([]);
  });
});
