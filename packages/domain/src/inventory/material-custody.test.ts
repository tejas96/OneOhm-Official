import { describe, expect, it } from 'vitest';
import {
  checkDraw,
  custodyTotals,
  installationFinished,
  isMaterialCategory,
  reconcileLine,
} from './material-custody';

describe('custodyTotals', () => {
  it('holds what was issued less what was used and returned', () => {
    expect(
      custodyTotals([
        { kind: 'issue', quantity: 30 },
        { kind: 'issue', quantity: 5.5 },
        { kind: 'use', quantity: 26.2 },
        { kind: 'return', quantity: 4 },
      ]),
    ).toEqual({ issued: 35.5, used: 26.2, returned: 4, balance: 5.3 });
  });

  it('starts empty', () => {
    expect(custodyTotals([])).toEqual({ issued: 0, used: 0, returned: 0, balance: 0 });
  });
});

describe('checkDraw', () => {
  it('allows using or returning up to what the contractor holds', () => {
    expect(checkDraw(26, 26, false)).toBeNull();
    expect(checkDraw(26, 12.5, false)).toBeNull();
  });

  it('refuses more than is held', () => {
    expect(checkDraw(6, 7, true)).toBe('more_than_held');
    expect(checkDraw(2.5, 2.6, false)).toBe('more_than_held');
  });

  it('refuses nothing, negatives and part panels', () => {
    expect(checkDraw(6, 0, false)).toBe('not_positive');
    expect(checkDraw(6, -1, false)).toBe('not_positive');
    expect(checkDraw(6, 1.5, true)).toBe('not_whole');
  });

  it('ignores float noise', () => {
    expect(checkDraw(0.3, 0.1 + 0.2, false)).toBeNull();
  });
});

describe('reconcileLine', () => {
  const line = { needed: 26, issued: 30, used: 26, returned: 4, installed: true };

  it('balances when everything issued is used or back in store', () => {
    expect(reconcileLine(line)).toEqual({ withContractor: 0, difference: 0, warning: null });
  });

  it('warns after installation when material is unaccounted for', () => {
    expect(reconcileLine({ ...line, returned: 0 })).toEqual({
      withContractor: 4,
      difference: 0,
      warning: 'unaccounted',
    });
  });

  it('does not warn while installation is still going', () => {
    expect(reconcileLine({ ...line, returned: 0, installed: false }).warning).toBeNull();
  });

  it('flags using more than the quotation allows', () => {
    expect(reconcileLine({ ...line, used: 29, returned: 1 })).toEqual({
      withContractor: 0,
      difference: 3,
      warning: 'over_used',
    });
  });

  it('shows using less than quoted as a negative difference', () => {
    expect(reconcileLine({ ...line, used: 24, returned: 6 }).difference).toBe(-2);
  });
});

describe('installationFinished', () => {
  it('needs every installation task completed', () => {
    expect(
      installationFinished([
        { stage: 'installation', status: 'completed' },
        { stage: 'installation', status: 'completed' },
        { stage: 'net_metering', status: 'pending' },
      ]),
    ).toBe(true);
    expect(
      installationFinished([
        { stage: 'installation', status: 'completed' },
        { stage: 'installation', status: 'in_review' },
      ]),
    ).toBe(false);
  });

  it('is false for a project without installation tasks', () => {
    expect(installationFinished([{ stage: 'survey', status: 'completed' }])).toBe(false);
  });
});

describe('isMaterialCategory', () => {
  it('counts goods, not labour, transport or DISCOM work', () => {
    expect(isMaterialCategory('cable')).toBe(true);
    expect(isMaterialCategory('structure')).toBe(true);
    expect(isMaterialCategory('installation')).toBe(false);
    expect(isMaterialCategory('liaisoning')).toBe(false);
  });
});
