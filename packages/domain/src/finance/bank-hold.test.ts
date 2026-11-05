import { describe, expect, it } from 'vitest';
import { bankChange, holdEndsAt, holdText, isHeld, releaseProblem } from './bank-hold';

const old = { name: 'Sai Traders', accountNumber: '123456789012', ifsc: 'SBIN0001234' };

describe('bankChange', () => {
  it('is a change when complete details differ in name, number or IFSC', () => {
    expect(bankChange(old, { ...old, accountNumber: '123456789099' })).toBe('changed');
    expect(bankChange(old, { ...old, ifsc: 'HDFC0001234' })).toBe('changed');
    expect(bankChange(old, { ...old, name: 'Sai Trading Co' })).toBe('changed');
  });
  it('ignores spacing and letter case', () => {
    expect(
      bankChange(old, {
        name: ' sai  TRADERS ',
        accountNumber: '1234 5678 9012',
        ifsc: 'sbin0001234',
      }),
    ).toBe('none');
  });
  it('is a first entry, not a change, when the old details were not complete', () => {
    expect(bankChange({}, old)).toBe('added');
    expect(bankChange({ name: 'Sai Traders' }, old)).toBe('added');
    expect(bankChange({ ...old, ifsc: null }, old)).toBe('added');
  });
  it('is nothing while the new details are still not complete', () => {
    expect(bankChange({}, { name: 'Sai Traders' })).toBe('none');
    expect(bankChange({}, {})).toBe('none');
  });
  it('treats clearing complete details as a change', () => {
    expect(bankChange(old, { ...old, accountNumber: '' })).toBe('changed');
  });
});

describe('isHeld', () => {
  const start = new Date('2026-11-05T10:00:00Z');
  const until = holdEndsAt(start);
  it('lasts 24 hours', () => {
    expect(until.toISOString()).toBe('2026-11-06T10:00:00.000Z');
  });
  it('holds until the end, then lets go', () => {
    const hold = { heldUntil: until, releasedAt: null };
    expect(isHeld(hold, new Date('2026-11-06T09:59:59Z'))).toBe(true);
    expect(isHeld(hold, new Date('2026-11-06T10:00:00Z'))).toBe(false);
  });
  it('is not held when released early or never set', () => {
    expect(isHeld({ heldUntil: until, releasedAt: start }, start)).toBe(false);
    expect(isHeld({ heldUntil: null, releasedAt: null }, start)).toBe(false);
  });
});

describe('releaseProblem', () => {
  const base = { held: true, canApprovePayments: true, userId: 'b', changedByUserId: 'a' };
  it('lets another approver release', () => {
    expect(releaseProblem(base)).toBeNull();
  });
  it('refuses the person who made the change', () => {
    expect(releaseProblem({ ...base, userId: 'a' })).toMatch(/another approver/);
  });
  it('refuses without the right, or with nothing held', () => {
    expect(releaseProblem({ ...base, canApprovePayments: false })).toMatch(/approves payments/);
    expect(releaseProblem({ ...base, held: false })).toMatch(/no hold/);
  });
});

describe('holdText', () => {
  it('names the payee, the time and who changed it', () => {
    const text = holdText('Sai Traders', '6 Nov, 4:30 pm', 'Asha');
    expect(text).toContain('Sai Traders');
    expect(text).toContain('6 Nov, 4:30 pm');
    expect(text).toContain('Asha');
  });
});
