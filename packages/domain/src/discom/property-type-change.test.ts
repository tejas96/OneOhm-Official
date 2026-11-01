import { describe, expect, it } from 'vitest';
import { droppedWithSubsidy, needsRepricing, subsidyAfterTypeChange } from './property-type-change';

describe('subsidyAfterTypeChange', () => {
  it('removes the subsidy when the site becomes commercial', () => {
    expect(subsidyAfterTypeChange(true, 'commercial')).toBe(false);
  });

  it('keeps the subsidy for a residential or society site', () => {
    expect(subsidyAfterTypeChange(true, 'individual')).toBe(true);
    expect(subsidyAfterTypeChange(true, 'society')).toBe(true);
  });

  it('never turns the subsidy on by itself', () => {
    expect(subsidyAfterTypeChange(false, 'individual')).toBe(false);
  });
});

describe('needsRepricing', () => {
  it('flags draft and sent quotes priced for another site type', () => {
    expect(needsRepricing({ status: 'sent', subsidyCategory: 'individual' }, 'commercial')).toBe(
      true,
    );
    expect(needsRepricing({ status: 'draft', subsidyCategory: 'commercial' }, 'society')).toBe(
      true,
    );
  });

  it('leaves matching, accepted and closed quotes alone', () => {
    expect(needsRepricing({ status: 'sent', subsidyCategory: 'commercial' }, 'commercial')).toBe(
      false,
    );
    expect(
      needsRepricing({ status: 'accepted', subsidyCategory: 'individual' }, 'commercial'),
    ).toBe(false);
    expect(
      needsRepricing({ status: 'superseded', subsidyCategory: 'individual' }, 'commercial'),
    ).toBe(false);
  });
});

describe('droppedWithSubsidy', () => {
  const subsidyOnly = { subsidy: true };

  it('drops subsidy-only work nobody has started', () => {
    expect(
      droppedWithSubsidy({ conditions: subsidyOnly, status: 'pending', startedAt: null }),
    ).toBe(true);
    expect(droppedWithSubsidy({ conditions: subsidyOnly, status: 'ready', startedAt: null })).toBe(
      true,
    );
  });

  it('keeps started or finished work and tasks every project has', () => {
    const started = new Date('2026-10-01T10:00:00Z');
    expect(
      droppedWithSubsidy({ conditions: subsidyOnly, status: 'in_progress', startedAt: started }),
    ).toBe(false);
    expect(
      droppedWithSubsidy({ conditions: subsidyOnly, status: 'ready', startedAt: started }),
    ).toBe(false);
    expect(
      droppedWithSubsidy({ conditions: subsidyOnly, status: 'completed', startedAt: started }),
    ).toBe(false);
    expect(droppedWithSubsidy({ conditions: null, status: 'pending', startedAt: null })).toBe(
      false,
    );
    expect(
      droppedWithSubsidy({ conditions: { subsidy: false }, status: 'pending', startedAt: null }),
    ).toBe(false);
  });
});
