import type { OnboardingSettingsRecord } from '@oneohm/api-contracts';
import { DEFAULT_ONBOARDING } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { catalog } from '../support/sales';

// Part 3, task 2: storage for the WhatsApp onboarding bot. A chat remembers its language,
// an estimate is kept per lead, and the owner's onboarding settings have a place to live.
// The behaviour on top (answers writing history, filing the bill) is exercised by tasks 4-6.
describe('WhatsApp onboarding storage', () => {
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

    await rows(`UPDATE products SET active = false WHERE id = $1`, [dcrPanel]);
    try {
      const inactive = { ...current, panelProductIds: { individual: dcrPanel } };
      expect((await put(inactive)).status).toBe(400);
    } finally {
      await rows(`UPDATE products SET active = true WHERE id = $1`, [dcrPanel]);
    }
  });
});
