import type { LeadDetail, LeadOwner, MessageTemplate } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import * as J from '../support/journey';
import { JOURNEY } from '../support/journey-onboard';
import { Transcript } from '../support/journey-transcript';
import { chatOf, choices, lastReply, promisedCall, replies } from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';

// The full WhatsApp customer journey, first half (Steps 1-6): from the Diwali ad to "Call
// me back", every step checked on both sides. The second half (quote to paid advance,
// reports, history) is 42-full-customer-journey-sale, which also writes the transcript.
const { code: CODE, campaign: CAMPAIGN, name: NAME, ad: AD } = JOURNEY;
const pdfType = { status: 200, type: expect.stringContaining('application/pdf') };

describe('The full WhatsApp customer journey: ad to call-back', () => {
  const phone = uniquePhone();
  const t = new Transcript('Journey, first half', phone, NAME);
  let admin: Session;
  let j: J.JourneySetup;
  let leadId = '';
  const lead = () => J.leadState(leadId);

  beforeAll(async () => {
    admin = await Session.admin();
    await t.load(admin);
    j = await J.journeySetup(admin, { code: CODE, name: CAMPAIGN });
  });
  afterAll(async () => {
    await j?.restore();
    await closeDb();
  });

  it('1. setup: two Pune sellers (one on leave), the city rule, the campaign, onboarding and template extras', async () => {
    const owners = await admin.get<LeadOwner[]>('/lead-owners');
    expect(owners.find((o) => o.id === j.away.id)?.onLeave).toBe(true);
    expect(owners.find((o) => o.id === j.owner.id)?.onLeave).toBe(false);
    expect(await admin.get('/settings/lead-assignment')).toEqual(j.rule);
    expect(j.rule.cityOwners.map((o) => o.cities)).toEqual([['Pune'], ['Pune']]);
    const campaigns = await admin.get<{ code: string; name: string }[]>('/lead-campaigns');
    expect(campaigns.find((c) => c.code === CODE)?.name).toBe(CAMPAIGN);
    expect(await admin.get('/settings/onboarding')).toMatchObject({
      enabled: true,
      serviceCities: ['Pune', 'Satara'],
    });
    const templates = await admin.get<MessageTemplate[]>('/settings/message-templates');
    for (const key of J.EXTRAS)
      expect(templates.find((x) => x.key === key)?.extrasApproved, key).toBe(true);
  });

  it('2. ad entry: "Hi OneOhm DIWALI26" from a Meta ad asks the language; मराठी is picked', async () => {
    await t.send({ text: `Hi OneOhm ${CODE}`, referral: { ...AD } });
    expect(choices(await lastReply(phone))).toEqual([
      'ob:language:en',
      'ob:language:mr',
      'ob:language:hi',
    ]);
    const [saved] = await rows<{ entry: unknown }>(
      `SELECT context->'entry' AS entry FROM wa_conversations WHERE phone = $1`,
      [phone],
    );
    expect(saved?.entry).toMatchObject({
      adId: AD.source_id,
      adHeadline: AD.headline,
      campaignCode: CODE,
    });
    expect(await rows('SELECT 1 FROM leads WHERE phone_e164 = $1', [phone])).toEqual([]);
    await t.tap('ob:language:mr');
    expect((await chatOf(phone)).language).toBe('mr');
    expect((await lastReply(phone))?.body).toBe(`आम्ही तुम्हाला ${NAME} म्हणू का?`);
  });

  it('3. onboarding in Marathi: the city makes the lead for the Pune owner at work; each answer writes it', async () => {
    await t.tap('ob:name:yes');
    expect(choices(await lastReply(phone))).toEqual([
      'ob:city:Pune',
      'ob:city:Satara',
      'ob:city:other',
      'ob:person',
    ]);
    await t.tap('ob:city:Pune');
    const [made, ...more] = await rows<{ id: string }>(
      'SELECT id FROM leads WHERE phone_e164 = $1',
      [phone],
    );
    expect(more).toEqual([]);
    leadId = made?.id ?? '';
    expect(await lead()).toMatchObject({
      name: NAME,
      city: 'Pune',
      source: 'whatsapp',
      owner_user_id: j.owner.id,
      campaign_code: CODE,
      ad_id: AD.source_id,
      ad_headline: AD.headline,
      next_action_on: today(),
      next_action_note: 'Finish onboarding',
    });
    expect(await J.alerted('lead_assigned', leadId)).toEqual([j.owner.id]);
    const [alert] = await rows<{ title: string; body: string }>(
      `SELECT title, body FROM notifications WHERE kind = 'lead_assigned' AND subject_id = $1`,
      [leadId],
    );
    expect(alert?.title).toContain('WhatsApp');
    expect(alert?.body).toContain(CAMPAIGN);
    expect(await J.historyOf(leadId)).toEqual(['Started onboarding on WhatsApp']);
    const answers: [string, string, Partial<J.LeadState>][] = [
      ['ob:site:home', 'Site: Home', { subsidy_category: 'individual' }],
      ['ob:bill:2000_3000', 'Bill: ₹2,000–3,000 (about 3 kW)', { estimated_wp: 3000 }],
      ['ob:roof:rcc', 'Roof: RCC', {}],
      ['ob:floors:2', 'Roof: RCC, 2 floors', {}],
    ];
    for (const [id, note, change] of answers) {
      const before = (await J.historyOf(leadId)).length;
      await t.tap(id);
      const history = await J.historyOf(leadId);
      expect(history.length, id).toBe(before + 1);
      expect(history.at(-1), id).toBe(note);
      expect(await lead()).toMatchObject(change);
    }
    expect(choices(await lastReply(phone))).toEqual(['ob:photo:later', 'ob:person']);
  });

  it('4. the bill photo at the photo step is filed on the lead; staff list and open it', async () => {
    await t.send({ media: { type: 'image', fileId: 'journey-bill', mimeType: 'image/jpeg' } });
    const docs = await rows<{ id: string; customer_id: string | null; category: string }>(
      'SELECT id, customer_id, category FROM documents WHERE lead_id = $1',
      [leadId],
    );
    expect(docs).toEqual([
      expect.objectContaining({ customer_id: null, category: 'electricity_bill' }),
    ]);
    const listed = await admin.get<{ id: string }[]>(`/documents?leadId=${leadId}`);
    expect(listed.map((doc) => doc.id)).toEqual([docs[0]?.id]);
    const opened = await admin.download(`/documents/${docs[0]?.id}/file`);
    expect(opened.status).toBe(200);
    expect(opened.bytes.length).toBeGreaterThan(0);
    expect(await J.historyOf(leadId)).toContain('Electricity bill received on WhatsApp');
    expect((await replies(phone)).some((reply) => reply.body?.includes('वीज बिल मिळाले'))).toBe(
      true,
    );
  });

  it('5. the instant estimate: stored, PDF sent, next steps offered, lead contacted with a call today', async () => {
    const [estimate, ...more] = await rows<{ id: string; capacity_wp: number }>(
      'SELECT id, capacity_wp FROM lead_estimates WHERE lead_id = $1',
      [leadId],
    );
    expect(more).toEqual([]);
    expect(estimate?.capacity_wp).toBeGreaterThanOrEqual(3000);
    const pdf = (await replies(phone)).find((reply) => reply.kind === 'document');
    expect(pdf?.filename).toMatch(/\.pdf$/);
    expect(pdf?.caption).toContain('हा अंदाज आहे');
    expect(await J.fetchFile(pdf?.link ?? '')).toMatchObject(pdfType);
    expect(choices(await lastReply(phone))).toEqual([
      'ob:done:call',
      'ob:person',
      'ob:done:notnow',
    ]);
    const now = await lead();
    expect(now).toMatchObject({ stage: 'contacted', next_action_on: today() });
    expect(now.next_action_note).toMatch(/^Call — estimate sent \(3(\.\d+)? kW, ₹/);
    expect((await J.historyOf(leadId)).at(-1)).toMatch(/^Estimate sent: 3(\.\d+)? kW, ₹/);
    const detail = await admin.get<LeadDetail>(`/leads/${leadId}`);
    expect(detail.latestEstimate?.id).toBe(estimate?.id);
    const file = await admin.download(detail.latestEstimate?.pdfUrl ?? '');
    expect(file.type).toContain('application/pdf');
    expect(file.bytes.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('6. "Call me back" puts a call on the owner\'s Today and alerts them once a day', async () => {
    // "Today" inside working hours, else "tomorrow morning" (the suite may run at night).
    const promise = promisedCall();
    await t.tap('ob:done:call');
    expect(await lead()).toMatchObject({
      next_action_on: promise.day,
      next_action_note: 'Customer asked for a call after the estimate',
    });
    expect((await J.historyOf(leadId)).at(-1)).toBe(
      `Asked for a call ${promise.when} after the estimate`,
    );
    const chat = await chatOf(phone);
    const told = await J.alerted('whatsapp_callback', chat.id);
    expect(told).toContain(j.owner.id);
    expect((await lastReply(phone))?.body).toBe(
      `धन्यवाद. ${promise.when === 'today' ? 'आज' : 'उद्या सकाळी'} ${j.owner.name.split(' ')[0]}कडून तुम्हाला कॉल येईल.`,
    );
    await t.tap('ob:done:call');
    expect(await J.alerted('whatsapp_callback', chat.id)).toHaveLength(told.length);
    const asked = (await J.historyOf(leadId)).filter((note) => note.startsWith('Asked for a call'));
    expect(asked).toHaveLength(1);
  });
});
