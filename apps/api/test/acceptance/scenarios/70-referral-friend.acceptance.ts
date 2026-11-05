import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bodyOf } from '../support/care';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf } from '../support/forms';
import { Session } from '../support/http';
import { lastReply, say, tap, withOnboarding } from '../support/onboarding';
import { programOn } from '../support/referral';
import { newCustomer, sellProject } from '../support/sales';
import { openChat, setForm } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// Refer a friend (redesign §15, phase 6): the form or the chat, a city tap, the existing referral lead,
// the thank-you with the reward from the programme, [My rewards] [Share my link].

describe('Referral: refer a friend', () => {
  let admin: Session;
  let undo: () => Promise<unknown>;
  let putCitiesBack: () => Promise<unknown>;
  const leadOf = (phone: string) =>
    rows<{ name: string; city: string; source: string; referred: string | null }>(
      `SELECT name, city, source::text AS source, referred_by_customer_id::text AS referred
         FROM leads WHERE phone_e164 = $1`,
      [phone],
    );

  beforeAll(async () => {
    admin = await Session.admin();
    undo = await programOn(admin);
    putCitiesBack = await withOnboarding(admin, { serviceCities: ['Sangli', 'Pune'] });
  });
  afterAll(async () => {
    await undo();
    await putCitiesBack();
    await setForm('refer_friend', null);
    await closeDb();
  });

  it('in the chat: name and number typed, the city a tap, then the thank-you with the reward', async () => {
    const sale = await sellProject(admin, { name: 'Refer Chat (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:refer');
    await say(phone, 'Suresh 98765 43210');
    const cities = await lastReply(phone);
    expect(cities?.body).toBe('Which city does Suresh live in?');
    expect(cities?.rows?.map((r) => r.title)).toEqual(['Sangli', 'Pune', 'Other city']);
    await tap(phone, 'rf:city:Pune');
    const thanks = await lastReply(phone);
    expect(thanks?.body).toBe(
      "Thank you! We'll call Suresh. You get ₹2,000 when their solar is installed.",
    );
    expect(thanks?.buttons?.map((b) => b.title)).toEqual(['My rewards', 'Share my link']);
    const [lead] = await leadOf('+919876543210');
    expect(lead).toMatchObject({
      name: 'Suresh',
      city: 'Pune',
      source: 'referral',
      referred: sale.customer.customerId,
    });
  });

  it('[Share my link] gives the code and a link a friend taps', async () => {
    const sale = await sellProject(admin, { name: 'Refer Link (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'rf:link');
    const body = await bodyOf(phone);
    expect(body).toMatch(/code \*[A-Z0-9-]+\*/);
    const [code] = await rows<{ code: string }>(
      'SELECT code FROM referral_codes WHERE customer_id = $1',
      [sale.customer.customerId],
    );
    expect(body).toContain(code?.code ?? 'missing');
  });

  it('with the form: name, mobile and city come back together and the lead is made', async () => {
    await setForm('refer_friend', FLOW_ID);
    const sale = await sellProject(admin, { name: 'Refer Form (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:refer');
    const form = await flowOf(phone);
    expect(form).toMatchObject({ screen: 'REFER', button: 'Refer a friend' });
    expect((form?.data.city_options as unknown as { id: string }[] | undefined)?.length).toBe(2);
    await sendInbound(phone, {
      form: {
        token: form?.token ?? '',
        fields: { friend: 'Meena Joshi', mobile: '90000 11122', city: 'Sangli' },
      },
    });
    expect((await lastReply(phone))?.body).toContain("We'll call Meena. You get ₹2,000");
    const [lead] = await leadOf('+919000011122');
    expect(lead).toMatchObject({ name: 'Meena Joshi', city: 'Sangli', source: 'referral' });
    await setForm('refer_friend', null);
  });

  it('a number we already know is said so; an unreadable one asks again; Marathi works', async () => {
    const sale = await sellProject(admin, { name: 'Refer Known (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:refer');
    await say(phone, 'just a name');
    expect(await bodyOf(phone)).toContain('could not find a name');
    // A number we are already in touch with (an open lead) is said so.
    const open = await newCustomer(admin, { name: 'Refer Known Lead (test)' });
    await say(phone, `Known ${open.phone.replace('+91', '')}`);
    await tap(phone, 'rf:city:Sangli');
    expect(await bodyOf(phone)).toContain('already in touch');

    const marathi = await sellProject(admin, { name: 'Refer Marathi (test)' });
    await openChat(marathi.customer.phone, marathi.customer.customerId);
    await tap(marathi.customer.phone, 'lang:mr');
    await tap(marathi.customer.phone, 'go:refer');
    await say(marathi.customer.phone, 'Anil 91111 22233');
    await tap(marathi.customer.phone, 'rf:city:-');
    expect(await bodyOf(marathi.customer.phone)).toContain(
      'आम्ही Anil यांना फोन करू. त्यांचा सोलर बसवल्यावर तुम्हाला ₹2,000 मिळतील.',
    );
    const [lead] = await leadOf('+919111122233');
    expect(lead?.city).toBe('Not given');
  });

  it('the thank-you names no reward while the programme is off', async () => {
    await undo();
    try {
      const sale = await sellProject(admin, { name: 'Refer Off (test)' });
      const phone = sale.customer.phone;
      await openChat(phone, sale.customer.customerId);
      await tap(phone, 'go:refer');
      await say(phone, 'Rahul 92222 33344');
      await tap(phone, 'rf:city:Pune');
      expect(await bodyOf(phone)).toBe("Thank you! We'll call Rahul.");
    } finally {
      undo = await programOn(admin);
    }
  });
});
