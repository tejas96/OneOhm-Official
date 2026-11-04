import type { DocumentRecord, OnboardingSettingsRecord } from '@oneohm/api-contracts';
import { DEFAULT_ONBOARDING } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  chatOf,
  choices,
  lastReply,
  leadsOf,
  notesOf,
  say,
  tap,
  withOnboarding,
} from '../support/onboarding';
import { catalog, newCustomer, today, uniquePhone } from '../support/sales';

// Part 3, task 2: storage for the WhatsApp onboarding bot. A chat remembers its language,
// an estimate is kept per lead, and the owner's onboarding settings have a place to live.
// The behaviour on top (answers writing history, filing the bill) is exercised by tasks 4-6.
describe('WhatsApp onboarding storage', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('stores a chat language and an estimate row; system lead updates write history', async () => {
    const [language] = await rows<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'wa_conversations' AND column_name = 'language'`,
    );
    expect(language?.is_nullable).toBe('YES');

    const columns = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'lead_estimates'`,
    );
    expect(columns.map((column) => column.column_name)).toEqual(
      expect.arrayContaining([
        'id',
        'lead_id',
        'capacity_wp',
        'module_count',
        'total_paise',
        'subsidy_paise',
        'effective_paise',
        'monthly_saving_paise',
        'payback_years',
        'answers',
        'priced',
        'created_at',
      ]),
    );
  });

  it('lists a paper filed on a lead that has no customer yet', async () => {
    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'Chat Bill Lead',
      phone: uniquePhone(),
      city: 'Sangli',
      nextActionOn: today(),
    });
    await rows(
      `INSERT INTO documents (lead_id, category, source, name, storage_key, content_type, size_bytes)
       VALUES ($1, 'electricity_bill', 'upload', 'bill.jpg', $2, 'image/jpeg', 10)`,
      [lead.id, `leads/${lead.id}/bill.jpg`],
    );
    const listed = await admin.get<DocumentRecord[]>(`/documents?leadId=${lead.id}`);
    expect(listed.map((doc) => doc.name)).toEqual(['bill.jpg']);
  });
});

// Part 3, task 3: Settings → Selling → WhatsApp onboarding, GET/PUT /settings/onboarding.
describe('WhatsApp onboarding settings', () => {
  let admin: Session;
  let prior: unknown[] = [];
  const read = () => admin.get<OnboardingSettingsRecord>('/settings/onboarding');

  beforeAll(async () => {
    admin = await Session.admin();
    prior = await rows(`SELECT value FROM business_settings WHERE key = 'onboarding'`);
  });

  afterAll(async () => {
    // Put the row back exactly as it was found (or leave the defaults in force).
    const before = (prior[0] as { value: unknown } | undefined)?.value ?? DEFAULT_ONBOARDING;
    await rows(
      `INSERT INTO business_settings (key, value) VALUES ('onboarding', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(before)],
    );
  });

  it('starts with the defaults', async () => {
    if (prior.length === 0) expect(await read()).toEqual(DEFAULT_ONBOARDING);
    else expect((await read()).billBands.length).toBeGreaterThanOrEqual(2);
  });

  it('saves, tidies the city list, and reads back', async () => {
    const { dcrPanel } = await catalog(admin);
    const current = await read();
    const saved = await admin.put<OnboardingSettingsRecord>('/settings/onboarding', {
      ...current,
      serviceCities: [' Pune ', '', 'Satara', 'Pune'],
      nudgeAfterHours: 0,
      panelProductIds: { individual: dcrPanel },
    });
    expect(saved.serviceCities).toEqual(['Pune', 'Satara']);
    const again = await read();
    expect(again.nudgeAfterHours).toBe(0);
    expect(again.panelProductIds).toEqual({ individual: dcrPanel });
  });

  it('rejects one band, and a panel that is inactive or not a panel', async () => {
    const { dcrPanel, inverter3k } = await catalog(admin);
    const current = await read();
    const put = (body: unknown) => admin.raw('PUT', '/settings/onboarding', body);
    const [first] = current.billBands;
    expect((await put({ ...current, billBands: [first] })).status).toBe(400);
    const notPanel = { ...current, panelProductIds: { commercial: inverter3k } };
    expect((await put(notPanel)).status).toBe(400);
    // Over 22 hours the nudge would fall outside the 23-hour chat window.
    expect((await put({ ...current, nudgeAfterHours: 23 })).status).toBe(400);
    expect((await put({ ...current, nudgeAfterHours: 22 })).status).toBe(200);
    // The city list also carries Other, Back and a person: 7 cities at most (C14).
    const cities = (n: number) => Array.from({ length: n }, (_, i) => `City ${i}`);
    expect((await put({ ...current, serviceCities: cities(8) })).status).toBe(400);
    // A Marathi bill label is kept; a blank one means "use the label" (C13).
    const [band, ...rest] = current.billBands;
    const labelled = [{ ...band, labelMr: '₹1,000 पर्यंत', labelHi: ' ' }, ...rest];
    expect((await put({ ...current, billBands: labelled })).status).toBe(200);
    const saved = (await read()).billBands[0];
    expect(saved).toMatchObject({ labelMr: '₹1,000 पर्यंत' });
    expect(saved).not.toHaveProperty('labelHi');
    await put(current);

    await rows(`UPDATE products SET active = false WHERE id = $1`, [dcrPanel]);
    try {
      const inactive = { ...current, panelProductIds: { individual: dcrPanel } };
      expect((await put(inactive)).status).toBe(400);
    } finally {
      await rows(`UPDATE products SET active = true WHERE id = $1`, [dcrPanel]);
    }
  });
});

// Part 3, task 4: who is onboarded. Only strangers with no lead (or a lead onboarding made);
// customers keep their menu, a staff-made lead keeps today's buttons, and turning
// onboarding off stops new chats but lets the ones in progress finish.
describe('Who the onboarding bot talks to', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  const OLD_BUTTONS = ['callback', 'human'];

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
  });
  afterAll(() => restore());

  it('a customer saying "hi" gets the customer menu', async () => {
    const customer = await newCustomer(admin, { name: 'Onboard Menu Customer (test)' });
    await say(customer.phone, 'hi');
    const menu = await lastReply(customer.phone);
    expect(menu?.kind).toBe('list');
    expect(choices(menu)).toContain('progress');
    expect((await chatOf(customer.phone)).ob).toBeNull();
  });

  it('a number with a lead made by staff gets the old buttons', async () => {
    const phone = uniquePhone();
    await admin.post('/leads', {
      name: 'Staff Lead (test)',
      phone,
      city: 'Sangli',
      nextActionOn: today(),
    });
    await say(phone, 'hi');
    expect(choices(await lastReply(phone))).toEqual(OLD_BUTTONS);
    await tap(phone, 'callback');
    expect(await leadsOf(phone)).toHaveLength(1);
    expect((await chatOf(phone)).ob).toBeNull();
  });

  it('with onboarding off a new number gets the old buttons; a chat in progress finishes', async () => {
    const started = uniquePhone();
    await say(started, 'hi');
    await tap(started, 'ob:language:en');
    const back = await withOnboarding(admin, { enabled: false });
    try {
      const fresh = uniquePhone();
      await say(fresh, 'hi');
      expect(choices(await lastReply(fresh))).toEqual(OLD_BUTTONS);
      await tap(started, 'ob:name:yes');
      await tap(started, 'ob:city:Pune');
      expect((await chatOf(started)).state).toBe('onboard:site');
      expect((await leadsOf(started))[0]?.city).toBe('Pune');
    } finally {
      await back();
    }
  });

  it("a friend's referral code makes the referral lead; onboarding asks the city it lacks", async () => {
    const customer = await newCustomer(admin, { name: 'Onboard Referrer (test)' });
    const code = `RF${String(Math.floor(Math.random() * 1e6)).padStart(6, '2')}`.replace(
      /[01]/g,
      '7',
    );
    await rows('INSERT INTO referral_codes (customer_id, code) VALUES ($1, $2)', [
      customer.customerId,
      code,
    ]);
    const phone = uniquePhone();
    await say(phone, `Hi OneOhm, my referral code is ${code}`);
    const [lead] = await leadsOf(phone);
    expect(lead).toMatchObject({ source: 'referral', city: 'Not given' });
    expect((await chatOf(phone)).state).toBe('onboard:city');
    await tap(phone, 'ob:city:Pune');
    const [updated] = await leadsOf(phone);
    expect(updated).toMatchObject({ city: 'Pune', owner_user_id: lead?.owner_user_id });
    expect((await notesOf(lead?.id ?? '')).map((row) => row.note)).toContain('City: Pune');
    expect((await chatOf(phone)).state).toBe('onboard:site');
    await tap(phone, 'ob:site:home');
    expect((await chatOf(phone)).state).toBe('onboard:bill');
    expect(await leadsOf(phone)).toHaveLength(1);
  });
});
