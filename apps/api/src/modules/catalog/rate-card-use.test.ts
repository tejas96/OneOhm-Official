import type { CostingCard } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { quotesBrokenBy } from './rate-card-use';

const cardWith = (...keys: string[]) =>
  ({ rateLines: keys.map((key) => ({ key, kind: 'cable' })) }) as unknown as CostingCard;

const quotes = [
  { number: 'Q-1', costing: { runs: [{ cable: 'dc_4', routing: null }] } },
  { number: 'Q-2', costing: { runs: [{ cable: 'ac_6', routing: null }] } },
  { number: 'Q-3', costing: null },
];

describe('quotesBrokenBy', () => {
  it('names the open quotes whose detail uses a rate the new card drops', () => {
    expect(quotesBrokenBy(cardWith('dc_4', 'ac_6'), cardWith('ac_6'), quotes)).toEqual(['Q-1']);
  });

  it('ignores quotes already broken before this change', () => {
    expect(quotesBrokenBy(cardWith('ac_6'), cardWith(), quotes)).toEqual(['Q-2']);
  });
});
