import { describe, expect, it } from 'vitest';
import { asksForDiscom, defaultDiscomId, discomChoices } from './discom-capture';

const msedcl = { id: 'msedcl', active: true };
const tata = { id: 'tata', active: true };
const best = { id: 'best', active: false };

describe('DISCOM capture', () => {
  it('asks on the task that records the consumer number, not on other tasks', () => {
    expect(asksForDiscom({ captures: ['consumer_number', 'sanctioned_capacity_kw'] })).toBe(true);
    expect(asksForDiscom({ captures: ['site_floors', 'structure_type'] })).toBe(false);
    expect(asksForDiscom({ captures: [] })).toBe(false);
  });

  it('keeps the site’s DISCOM, else picks the only active one, else guesses nothing', () => {
    expect(defaultDiscomId([msedcl, tata], 'tata')).toBe('tata');
    expect(defaultDiscomId([msedcl, best], null)).toBe('msedcl');
    expect(defaultDiscomId([msedcl, tata], null)).toBeNull();
    expect(defaultDiscomId([best], null)).toBeNull();
    expect(defaultDiscomId([], null)).toBeNull();
  });

  it('offers active DISCOMs and keeps a retired one the site already has', () => {
    expect(discomChoices([msedcl, tata, best], null).map((d) => d.id)).toEqual(['msedcl', 'tata']);
    expect(discomChoices([msedcl, best], 'best').map((d) => d.id)).toEqual(['msedcl', 'best']);
  });
});
