import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import {
  chatOf,
  choices,
  handOverAlerts,
  lastReply,
  leadsOf,
  notesOf,
  replies,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';

// Part 3, task 4: a new number is onboarded by taps in its own language. The lead is made
// at the city answer and every later answer writes it with one history note; a person is
// always one tap (or two unclear answers) away, and every hand-over alerts someone.
const PROFILE = 'Acceptance Customer (test)';
const whatsappNotes = async (leadId: string) =>
  (await notesOf(leadId)).filter((row) => row.kind === 'whatsapp').map((row) => row.note);

describe('WhatsApp onboarding flow', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune', 'Satara'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('asks the language on "hi", then the name, and makes one lead at the city answer', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    expect(choices(await lastReply(phone))).toEqual([
      'ob:language:en',
      'ob:language:mr',
      'ob:language:hi',
    ]);
    await tap(phone, 'ob:language:en');
    const name = await lastReply(phone);
    expect(name?.body).toContain(PROFILE);
    expect(choices(name)).toEqual(['ob:name:yes', 'ob:name:change', 'ob:person']);
    await tap(phone, 'ob:name:yes');
    expect(await leadsOf(phone)).toEqual([]);
    expect(choices(await lastReply(phone))).toEqual([
      'ob:city:Pune',
      'ob:city:Satara',
      'ob:city:other',
      'ob:city:back',
      'ob:person',
    ]);

    await tap(phone, 'ob:city:Pune');
    const [lead, ...more] = await leadsOf(phone);
    expect(more).toEqual([]);
    expect(lead).toMatchObject({
      name: PROFILE,
      city: 'Pune',
      source: 'whatsapp',
      next_action_on: today(),
      next_action_note: 'Finish onboarding',
    });
    expect(lead?.owner_user_id).toBeTruthy();
    expect((await notesOf(lead?.id ?? '')).map((row) => row.note)).toContain(
      'Started onboarding on WhatsApp',
    );
    expect((await chatOf(phone)).state).toBe('onboard:site');
    expect(choices(await lastReply(phone)).at(-1)).toBe('ob:person');
  });

  it('writes site, bill, roof and floors on the lead with one note for roof and floors', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    const [lead] = await leadsOf(phone);
    await tap(phone, 'ob:site:business');
    expect((await leadsOf(phone))[0]?.subsidy_category).toBe('commercial');
    await tap(phone, 'ob:bill:2000_3000');
    expect((await leadsOf(phone))[0]?.estimated_wp).toBe(3000);
    await tap(phone, 'ob:roof:rcc');
    await tap(phone, 'ob:floors:2');
    expect(await whatsappNotes(lead?.id ?? '')).toEqual([
      'Site: Shop or business',
      'Bill: ₹2,000–3,000 (about 3 kW)',
      'Roof: RCC, 2 floors',
    ]);
    expect(choices(await lastReply(phone))).toEqual([
      'ob:photo:later',
      'ob:photo:back',
      'ob:person',
    ]);

    await tap(phone, 'ob:photo:later');
    expect((await chatOf(phone)).state).toBe('onboard:done');
    // The estimate follows (scenario 34): its next-step buttons are the last reply.
    expect(choices(await lastReply(phone))).toContain('ob:done:call');
    expect((await whatsappNotes(lead?.id ?? '')).at(-1)).toBe('Bill photo: will send later');
  });

  it('"back" at the roof asks the bill again; "hi" repeats the question, never the start', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await say(phone, 'hi');
    expect(choices(await lastReply(phone))[0]).toBe('ob:site:home');
    await tap(phone, 'ob:site:home');
    await tap(phone, 'ob:bill:1000_2000');
    await say(phone, 'back');
    expect((await chatOf(phone)).state).toBe('onboard:bill');
    expect(choices(await lastReply(phone))).toContain('ob:bill:3000_5000');
    await tap(phone, 'ob:bill:3000_5000');
    expect((await leadsOf(phone))[0]?.estimated_wp).toBe(5000);
    expect((await chatOf(phone)).state).toBe('onboard:roof');
    expect(
      (await replies(phone)).filter((r) => choices(r).includes('ob:language:en')),
    ).toHaveLength(1);
  });

  it('two unclear answers at the bill hand the chat to the lead owner, who is alerted', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:site:home');
    await say(phone, 'not sure');
    const chat = await chatOf(phone);
    expect(chat.state).toBe('onboard:bill');
    expect(chat.ob?.misses).toBe(1);
    expect(choices(await lastReply(phone))).toContain('ob:bill:up_to_1000');

    await say(phone, 'no idea really');
    expect((await chatOf(phone)).state).toBe('human');
    const [lead] = await leadsOf(phone);
    const alerts = await handOverAlerts(chat.id);
    expect(alerts.map((alert) => alert.user_id)).toContain(lead?.owner_user_id);
    expect(alerts[0]?.body).toContain('Onboarding answers so far');
    expect(alerts[0]?.body).toContain('Site: Home');
    expect((await lastReply(phone))?.body).toContain('will reply to you here');
  });

  it('"Talk to a person" at the site question hands over with the summary', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:person');
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    const [alert] = await handOverAlerts(chat.id);
    expect(alert?.body).toContain(`Name: ${PROFILE}`);
    expect(alert?.body).toContain('City: Pune');
  });

  it('every hand-over before the lead exists still alerts sales', async () => {
    const unclear = uniquePhone();
    await say(unclear, 'hi');
    await say(unclear, 'what is this');
    await say(unclear, 'tell me price');
    const first = await chatOf(unclear);
    expect(first.state).toBe('human');
    expect((await handOverAlerts(first.id)).length).toBeGreaterThan(0);
    expect((await lastReply(unclear))?.body).toContain('will reply to you here');

    const person = uniquePhone();
    await say(person, 'hi');
    await tap(person, 'ob:language:en');
    await tap(person, 'ob:person');
    const second = await chatOf(person);
    expect(second.state).toBe('human');
    const [alert] = await handOverAlerts(second.id);
    expect(alert?.body).toContain('Onboarding answers so far: Language: English');
  });

  it('applies each of two quick messages once, to the step the chat is on', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    const [lead] = await leadsOf(phone);
    await Promise.all([tap(phone, 'ob:site:home'), tap(phone, 'ob:site:home')]);
    expect(await whatsappNotes(lead?.id ?? '')).toEqual(['Site: Home']);
    const chat = await chatOf(phone);
    expect(chat.state).toBe('onboard:bill');
    expect(chat.ob?.misses).toBe(0);

    // A tap and then a typed answer right after it: the bill, then the roof.
    await tap(phone, 'ob:bill:up_to_1000');
    await say(phone, 'rcc');
    expect((await chatOf(phone)).state).toBe('onboard:floors');
    // The roof waits for the floors: one note for both.
    expect((await whatsappNotes(lead?.id ?? '')).at(-1)).toMatch(/^Bill: /);
  });

  it('asks the next question in Marathi once Marathi is chosen', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:mr');
    expect((await chatOf(phone)).language).toBe('mr');
    const name = await lastReply(phone);
    expect(name?.body).toBe(`आम्ही तुम्हाला ${PROFILE} म्हणू का?`);
    expect(name?.buttons?.map((button) => button.title)).toEqual(['हो', 'बदला', 'व्यक्तीशी बोला']);
  });

  it('after staff release the bot asks the first missing question, not the answered ones', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:site:home');
    await tap(phone, 'ob:person');
    const chat = await chatOf(phone);
    expect((await admin.raw('POST', `/whatsapp/chats/${chat.id}/release`)).status).toBe(200);
    expect((await chatOf(phone)).ob?.answers).toMatchObject({ city: 'Pune', site: 'home' });

    await say(phone, 'ok tell me');
    expect((await chatOf(phone)).state).toBe('onboard:bill');
    expect(choices(await lastReply(phone))).toContain('ob:bill:up_to_1000');
    const asked = (await replies(phone)).flatMap(choices);
    expect(asked.filter((id) => id === 'ob:name:yes')).toHaveLength(1);
    expect(asked.filter((id) => id === 'ob:site:home')).toHaveLength(1);
  });
});
