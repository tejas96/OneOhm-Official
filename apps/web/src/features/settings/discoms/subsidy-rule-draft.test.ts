import { describe, expect, it } from 'vitest';
import { checkDraft, editorCategories, slabsWouldBeLost } from './subsidy-rule-draft';

const draft = {
  category: 'individual' as const,
  validFrom: '2026-12-01',
  slabs: [
    { toWp: 2000, paisePerKw: 3_000_000 },
    { toWp: null, paisePerKw: 1_800_000 },
  ],
  capPaise: 7_800_000,
  perHouseholdWp: null,
  maxEligibleWp: null,
};

describe('subsidy rule draft', () => {
  it('builds the body when every rate and the cap are typed', () => {
    const result = checkDraft(draft);
    expect(result.missing).toEqual([]);
    expect(result.body?.slabs.map((slab) => slab.fromWp)).toEqual([0, 2000]);
  });

  it('marks an empty slab rate and an empty cap as required instead of sending 0', () => {
    const result = checkDraft({
      ...draft,
      slabs: [
        { toWp: 2000, paisePerKw: null },
        { toWp: null, paisePerKw: 1_800_000 },
      ],
      capPaise: null,
    });
    expect(result.body).toBeNull();
    expect(result.missing).toEqual(['slabs.0.paisePerKw', 'capPaise']);
  });

  it('lets a rule with no slabs through with no cap (no subsidy)', () => {
    const result = checkDraft({ ...draft, slabs: [], capPaise: null });
    expect(result.missing).toEqual([]);
    expect(result.body?.capPaise).toBe(0);
  });

  it('does not offer Commercial for a new version, which never gets a subsidy', () => {
    expect(editorCategories(null)).toEqual(['individual', 'society']);
    expect(editorCategories('commercial')).toEqual(['individual', 'society', 'commercial']);
  });

  it('sees typed slabs that a category switch would replace', () => {
    expect(slabsWouldBeLost(draft.slabs, draft.slabs)).toBe(false);
    expect(slabsWouldBeLost([], [])).toBe(false);
    expect(slabsWouldBeLost([{ toWp: 1000, paisePerKw: 5 }], draft.slabs)).toBe(true);
  });
});
