import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bodyOf } from '../support/care';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf, formLinkOf } from '../support/forms';
import { Session } from '../support/http';
import { notesOf, replies, tap, withOnboarding } from '../support/onboarding';
import { programOn } from '../support/referral';
import { sellProject, today, uniquePhone } from '../support/sales';
import { openChat, setForm } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// Refer a friend by form, edge cases: a number that is a lead, a customer or the customer's own, bad
// numbers, +91 / 0 / spaces, "Other city", and what staff see on the lead.

describe('Referral form: edges', () => {
  let admin: Session;
  let undo: () => Promise<unknown>;
  let citiesBack: () => Promise<unknown>;
  const leadsOn = (phone: string) =>
    rows<{ id: string; name: string; city: string; source: string; referred: string | null }>(
      `SELECT id, name, city, source::text AS source, referred_by_customer_id::text AS referred
         FROM leads WHERE phone_e164 = $1`,
      [phone],
    );

  beforeAll(async () => {
    admin = await Session.admin();
    undo = await programOn(admin);
    citiesBack = await withOnboarding(admin, { serviceCities: ['Sangli', 'Pune'] });
    await setForm('refer_friend', FLOW_ID);
  });
  afterAll(async () => {
    await setForm('refer_friend', null);
    await undo();
    await citiesBack();
    await closeDb();
  });

  async function opened(name: string) {
    const sale = await sellProject(admin, { name });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:refer');
    return { sale, phone, customerId: sale.customer.customerId, form: await flowOf(phone) };
  }
  const submit = (phone: string, token: string | undefined, fields: Record<string, string>) =>
    sendInbound(phone, { form: { token: token ?? '', fields } });

  it('the form offers "Other city" after the service cities', async () => {
    const { form } = await opened('Refer Edge Options (test)');
    const options = (form?.data.city_options ?? []) as unknown as { id: string }[];
    const ids = options.map((one) => one.id);
    expect(ids).toEqual(['Sangli', 'Pune', '-']);
  });

  it('+91, 0 and spaces are normalised; the lead holds name, number, city and who referred', async () => {
    const one = await opened('Refer Edge Normal (test)');
    await submit(one.phone, one.form?.token, {
      friend: '  Meena   Joshi ',
      mobile: '+91 88765-43210',
      city: 'Pune',
    });
    const [lead] = await leadsOn('+918876543210');
    expect(lead).toMatchObject({
      name: 'Meena Joshi',
      city: 'Pune',
      source: 'referral',
      referred: one.customerId,
    });
    expect((await notesOf(lead?.id ?? '')).map((row) => row.note).join(' ')).toContain(
      'Referred by',
    );
    expect(await formLinkOf(one.phone)).toEqual({ kind: 'lead', id: lead?.id });
    expect(await bodyOf(one.phone)).toContain("We'll call Meena. You get ₹2,000");

    const two = await opened('Refer Edge Zero (test)');
    await submit(two.phone, two.form?.token, {
      friend: 'Ravi',
      mobile: '087654 32111',
      city: 'Sangli',
    });
    expect((await leadsOn('+918765432111'))[0]?.name).toBe('Ravi');
  });

  it('a short, long or non-Indian number is refused with a clear reply and a fresh form', async () => {
    for (const mobile of ['98765', '12345 67890', '98765432101', 'call me', '']) {
      const one = await opened('Refer Edge Bad (test)');
      const before = (await replies(one.phone)).length;
      await submit(one.phone, one.form?.token, { friend: 'Sunil', mobile, city: 'Pune' });
      const said = (await replies(one.phone)).slice(before);
      expect(said[0]?.body, mobile).toContain('does not look right');
      expect(said.at(-1)?.kind, mobile).toBe('flow');
    }
    const named = await opened('Refer Edge Name (test)');
    await submit(named.phone, named.form?.token, {
      friend: '12',
      mobile: '90000 22211',
      city: 'Pune',
    });
    expect(await leadsOn('+919000022211')).toHaveLength(0);
    expect((await replies(named.phone)).some((r) => r.body.includes('friend'))).toBe(true);
  });

  it('their own number, a customer and an open lead are said politely and make no second lead', async () => {
    const one = await opened('Refer Edge Known (test)');
    const own = (
      await rows<{ p: string }>('SELECT phone_e164 AS p FROM customers WHERE id = $1', [
        one.customerId,
      ])
    )[0]?.p;
    await submit(one.phone, one.form?.token, { friend: 'Me', mobile: own ?? '', city: 'Pune' });
    expect(await bodyOf(one.phone)).toContain('your own number');
    expect(await leadsOn(own ?? '')).toHaveLength(1);

    const other = await sellProject(admin, { name: 'Refer Edge Customer (test)' });
    await tap(one.phone, 'go:refer');
    const second = await flowOf(one.phone);
    await submit(one.phone, second?.token, {
      friend: 'Customer',
      mobile: other.customer.phone,
      city: 'Pune',
    });
    expect(await bodyOf(one.phone)).toContain('already with us');

    const open = { phone: uniquePhone() };
    await admin.post('/leads', {
      name: 'Refer Edge Lead (test)',
      phone: open.phone,
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    const [lead] = await leadsOn(open.phone);
    await tap(one.phone, 'go:refer');
    const third = await flowOf(one.phone);
    await submit(one.phone, third?.token, { friend: 'Known', mobile: open.phone, city: 'Pune' });
    expect(await bodyOf(one.phone)).toContain('already in touch');
    expect(await leadsOn(open.phone)).toHaveLength(1);
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes.some((note) => note.includes('also referred this number'))).toBe(true);
    expect(await formLinkOf(one.phone)).toEqual({ kind: 'lead', id: lead?.id });
  });

  it('"Other city" and a city we do not list are saved as not given, with a note, and the form is old once used', async () => {
    const one = await opened('Refer Edge Other (test)');
    await submit(one.phone, one.form?.token, { friend: 'Kiran', mobile: '91234 56789', city: '-' });
    const [lead] = await leadsOn('+919123456789');
    expect(lead?.city).toBe('Not given');
    expect((await notesOf(lead?.id ?? '')).map((row) => row.note).join(' ')).toContain(
      'City not given',
    );
    await submit(one.phone, one.form?.token, {
      friend: 'Kiran',
      mobile: '91234 56790',
      city: 'Pune',
    });
    expect(await leadsOn('+919123456790')).toHaveLength(0);

    const two = await opened('Refer Edge Forged (test)');
    await submit(two.phone, two.form?.token, {
      friend: 'Zed',
      mobile: '92222 11100',
      city: 'Atlantis',
    });
    expect((await leadsOn('+919222211100'))[0]?.city).toBe('Not given');
  });

  it('the thank-you names no reward when the programme is off', async () => {
    await undo();
    try {
      const one = await opened('Refer Edge Off (test)');
      await submit(one.phone, one.form?.token, {
        friend: 'Omkar',
        mobile: '94444 55566',
        city: 'Pune',
      });
      expect(await bodyOf(one.phone)).toBe("Thank you! We'll call Omkar.");
    } finally {
      undo = await programOn(admin);
    }
  });
});
