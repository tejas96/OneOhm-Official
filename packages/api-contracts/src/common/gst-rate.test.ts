import { describe, expect, it } from 'vitest';
import { gstRateSchema } from './gst-rate';

describe('gstRateSchema', () => {
  it('accepts the GST slabs, stored in basis points', () => {
    for (const bp of [0, 500, 1_200, 1_800, 2_800, 4_000]) {
      expect(gstRateSchema.safeParse(bp).success).toBe(true);
    }
  });

  it('refuses any other rate', () => {
    for (const bp of [100, 1_000, 1_850, 5_000, 10_000]) {
      const result = gstRateSchema.safeParse(bp);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Use a GST rate: 0, 5, 12, 18, 28 or 40%.');
    }
  });
});
