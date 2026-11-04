import { describe, expect, it } from 'vitest';
import { amcSaleRefusal } from './amc-sale-check';

describe('amcSaleRefusal', () => {
  it('refuses a project that is not commissioned yet', () => {
    expect(amcSaleRefusal('active', null)).toMatch(/commissioned/);
  });

  it('refuses a cancelled project', () => {
    expect(amcSaleRefusal('cancelled', '2026-10-01')).toMatch(/cancelled/);
  });

  it('allows a commissioned project', () => {
    expect(amcSaleRefusal('operational', '2026-10-01')).toBeNull();
  });
});
