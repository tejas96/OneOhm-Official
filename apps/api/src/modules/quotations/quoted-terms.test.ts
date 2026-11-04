import { DEFAULT_MILESTONES, type MilestoneShare } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { readQuotedTerms, withQuotedTerms } from './quoted-terms';

const society: MilestoneShare[] = [
  { key: 'advance', label: 'Advance', shareBp: 4000, trigger: 'quotation_accepted' },
  { key: 'final', label: 'On completion', shareBp: 6000, trigger: 'commissioning_completed' },
];

describe('quoted payment terms', () => {
  it('finds no terms on a quotation never sent', () => {
    expect(readQuotedTerms({ comparison: null })).toBeNull();
    expect(readQuotedTerms(null)).toBeNull();
  });

  it('reads back the terms saved on the quotation', () => {
    const snapshot = withQuotedTerms({ comparison: null }, { planId: 'p1', steps: society });
    expect(readQuotedTerms(snapshot)).toEqual({ planId: 'p1', steps: society });
  });

  it('keeps the rest of the snapshot', () => {
    const snapshot = withQuotedTerms({ comparison: 'x' }, { planId: null, steps: [] });
    expect(snapshot.comparison).toBe('x');
  });

  it('never replaces terms the customer already saw', () => {
    const first = withQuotedTerms({}, { planId: 'p1', steps: society });
    const again = withQuotedTerms(first, { planId: null, steps: [...DEFAULT_MILESTONES] });
    expect(readQuotedTerms(again)?.planId).toBe('p1');
  });
});
