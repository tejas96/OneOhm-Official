import { describe, expect, it } from 'vitest';
import { PRACTICE_FEE_PAISE, practiceEntity } from './payout-practice';

const row = { id: '11111111-2222-3333-4444-555555555555', providerPayoutId: 'pout_abc' };

describe('practice payout entity', () => {
  it('looks like a RazorpayX processed payout with a fake UTR and a small fee', () => {
    const entity = practiceEntity(row, 'processed');
    expect(entity).toMatchObject({
      id: 'pout_abc',
      reference_id: row.id,
      status: 'processed',
      fees: PRACTICE_FEE_PAISE,
    });
    expect(String(entity.utr)).toMatch(/^PRACTICE[0-9A-F]{10}$/);
  });

  it('gives failed and reversed a plain reason and no UTR', () => {
    for (const outcome of ['failed', 'reversed'] as const) {
      const entity = practiceEntity(row, outcome);
      expect(entity.status).toBe(outcome);
      expect(entity.utr).toBeUndefined();
      expect(JSON.stringify(entity.status_details)).toContain('Practice');
    }
  });

  it('finds the payout by our reference when RazorpayX never gave an id', () => {
    const entity = practiceEntity({ ...row, providerPayoutId: null }, 'processed');
    expect(String(entity.id)).toMatch(/^pout_sandbox_/);
    expect(entity.reference_id).toBe(row.id);
  });
});
