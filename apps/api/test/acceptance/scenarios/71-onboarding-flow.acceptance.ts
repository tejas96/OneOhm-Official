import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
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
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Redesign §16: a new contact is onboarded by taps — a name only when it is a real one, the city by list or
// by a 📍 pin, and under the estimate [Book a visit] [Call me] [Not now].
describe('New contacts: onboarding by taps', () => {
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

  it('never calls a person by an emoji or a shop name: they type theirs, and a typed emoji is refused', async () => {
    const emoji = uniquePhone();
    await sendInbound(emoji, { text: 'hi', profileName: '😀🔥' });
    await sendInbound(emoji, { buttonReply: 'ob:language:en', profileName: '😀🔥' });
    expect((await lastReply(emoji))?.body).toBe('Please type your name.');
    await sendInbound(emoji, { text: '🔥🔥', profileName: '😀🔥' });
    expect((await lastReply(emoji))?.body).toContain('Please type your name in letters');
    await sendInbound(emoji, { text: 'Ravi Patil', profileName: '😀🔥' });
    expect((await chatOf(emoji)).state).toBe('onboard:city');

    const shop = uniquePhone();
    await sendInbound(shop, { text: 'hi', profileName: 'Surya Solar Traders' });
    await sendInbound(shop, { buttonReply: 'ob:language:en', profileName: 'Surya Solar Traders' });
    expect((await lastReply(shop))?.body).toBe('Please type your name.');

    const person = uniquePhone();
    await sendInbound(person, { text: 'hi', profileName: 'suresh patil' });
    await sendInbound(person, { buttonReply: 'ob:language:en', profileName: 'suresh patil' });
    expect((await lastReply(person))?.body).toBe('Shall we call you Suresh Patil?');
  });

  it('the city list has [📍 Send location]; a pin that names a city we serve fills it and makes the lead', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await tap(phone, 'ob:name:yes');
    expect(choices(await lastReply(phone))).toContain('ob:city:pin');
    await tap(phone, 'ob:city:pin');
    const ask = await lastReply(phone);
    expect(ask?.kind).toBe('location_request');
    await sendInbound(phone, {
      location: { latitude: 17.68, longitude: 74.02, name: 'Home', address: 'Satara, Maharashtra' },
    });
    const [lead] = await leadsOf(phone);
    expect(lead?.city).toBe('Satara');
    expect((await chatOf(phone)).state).toBe('onboard:site');
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes).toContain('Location pin: https://maps.google.com/?q=17.68,74.02');
  });

  it('a pin that names no known city is kept: the city list is asked, and the pin lands on the lead then', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await tap(phone, 'ob:name:yes');
    await sendInbound(phone, { location: { latitude: 19.07, longitude: 72.87 } });
    expect(await leadsOf(phone)).toEqual([]);
    expect((await lastReply(phone))?.rows?.some((row) => row.id === 'ob:city:Pune')).toBe(true);
    expect((await chatOf(phone)).ob).toMatchObject({ misses: 0 });
    await tap(phone, 'ob:city:Pune');
    const [lead] = await leadsOf(phone);
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes).toContain('Location pin: https://maps.google.com/?q=19.07,72.87');
  });

  async function atEstimate(phone: string) {
    await upToSite(phone);
    await tap(phone, 'ob:site:home');
    await tap(phone, 'ob:bill:2000_3000');
    await tap(phone, 'ob:roof:rcc');
    await tap(phone, 'ob:floors:1');
    await tap(phone, 'ob:photo:later');
    return (await leadsOf(phone))[0];
  }

  it('[Book a visit] offers free days, then Morning/Afternoon; the pick lands on the lead and the owner is told', async () => {
    const phone = uniquePhone();
    const lead = await atEstimate(phone);
    const estimate = await lastReply(phone);
    expect(estimate?.buttons?.map((b) => b.title)).toEqual(['Book a visit', 'Call me', 'Not now']);
    await tap(phone, 'ob:done:visit');
    const days = await lastReply(phone);
    expect(days?.body).toBe('Which day suits you for the free site visit?');
    expect(days?.rows?.at(-1)?.id).toBe('ob:person');
    const day = days?.rows?.[0]?.id ?? '';
    expect(day).toMatch(/^ob:vday:\d{4}-\d{2}-\d{2}$/);
    await tap(phone, day);
    const slots = await lastReply(phone);
    expect(slots?.buttons?.map((b) => b.title)).toEqual(['Morning', 'Afternoon']);
    await tap(phone, slots?.buttons?.[0]?.id ?? '');
    const [after] = await leadsOf(phone);
    expect(after?.next_action_on).toBe(day.slice('ob:vday:'.length));
    expect(after?.next_action_note).toBe('Confirm the site visit the customer picked');
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes.some((note) => note.startsWith('Asked for a free site visit on WhatsApp'))).toBe(
      true,
    );
    expect((await lastReply(phone))?.body).toMatch(/will confirm your visit by/);
    const alert = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'whatsapp_callback' AND title LIKE '%for the site visit'",
    );
    expect(alert.length).toBeGreaterThan(0);
  });

  it('a stale or invalid visit day is refused with the list again, never booked', async () => {
    const phone = uniquePhone();
    await atEstimate(phone);
    await tap(phone, 'ob:done:visit');
    await tap(phone, 'ob:vday:2020-01-06');
    expect((await lastReply(phone))?.kind).toBe('list');
    await tap(phone, 'ob:vslot:2020-01-06:morning');
    const [lead] = await leadsOf(phone);
    expect(lead?.next_action_note).not.toBe('Confirm the site visit the customer picked');
  });

  it('[Call me] keeps the promised call, [Not now] asks when to check back', async () => {
    const phone = uniquePhone();
    await atEstimate(phone);
    await tap(phone, 'ob:done:call');
    expect((await lastReply(phone))?.body).toMatch(
      /will call you (today|tomorrow morning|on Monday morning)/,
    );
    await tap(phone, 'ob:done:notnow');
    expect(choices(await lastReply(phone))).toEqual([
      'ob:done:later:1w',
      'ob:done:later:1m',
      'ob:done:later:3m',
      'ob:person',
    ]);
    await tap(phone, 'ob:done:later:1w');
    expect((await lastReply(phone))?.buttons?.map((b) => b.title)).toEqual([
      'Call me',
      'Talk to a person',
    ]);
    expect((await replies(phone)).length).toBeGreaterThan(5);
  });

  it('a referral with no usable profile name asks the language and then the name', async () => {
    const code = `RF${String(Math.floor(Math.random() * 1e6)).padStart(6, '2')}`.replace(
      /[01]/g,
      '7',
    );
    const referrer = await (await import('../support/sales')).newCustomer(admin, {
      name: 'Flow Referrer (test)',
    });
    await rows('INSERT INTO referral_codes (customer_id, code) VALUES ($1, $2)', [
      referrer.customerId,
      code,
    ]);
    const phone = uniquePhone();
    await sendInbound(phone, { text: `Hi OneOhm, my referral code is ${code}`, profileName: '🌞' });
    expect((await chatOf(phone)).state).toBe('onboard:language');
    await sendInbound(phone, { buttonReply: 'ob:language:en', profileName: '🌞' });
    expect((await chatOf(phone)).state).toBe('onboard:name');
    expect((await lastReply(phone))?.body).toBe('Please type your name.');
    await sendInbound(phone, { text: 'Meera Joshi', profileName: '🌞' });
    expect((await leadsOf(phone))[0]?.name).toBe('Meera Joshi');
    expect((await chatOf(phone)).state).toBe('onboard:city');
  });
});
