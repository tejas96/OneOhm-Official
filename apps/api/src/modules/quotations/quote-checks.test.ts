import { describe, expect, it } from 'vitest';
import { assertQuotable } from './quote-checks';

describe('assertQuotable', () => {
  it('refuses an archived product on a new or edited quote', () => {
    expect(() => assertQuotable({ active: false, name: 'Mono 545' }, 'panelProductId')).toThrow(
      /Mono 545 is archived/,
    );
  });

  it('allows a product in use', () => {
    expect(() =>
      assertQuotable({ active: true, name: 'Mono 545' }, 'panelProductId'),
    ).not.toThrow();
  });
});
