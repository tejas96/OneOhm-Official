import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';

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
