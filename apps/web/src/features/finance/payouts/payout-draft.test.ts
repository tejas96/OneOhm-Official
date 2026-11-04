import { describe, expect, it } from 'vitest';
import { checkDraft, draftFrom, payloadOf } from './payout-draft';

const NONE = {
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  upiId: null,
  pan: null,
};
const missing = (field: string) => `missing ${field}`;
const BANK = {
  ...NONE,
  bankAccountName: 'ASHA',
  bankAccountNumber: '123456789012',
  bankIfsc: 'HDFC0001234',
  pan: 'ABCDE1234F',
};

describe('payout draft (finance)', () => {
  it('opens a saved bank account on Bank account, filled in', () => {
    const draft = draftFrom(BANK);
    expect(draft.method).toBe('bank');
    expect(draft.values.bankAccountNumber).toBe('123456789012');
    expect(checkDraft(draft, missing)).toEqual({});
  });

  it('sends only the chosen way and clears the other', () => {
    const draft = draftFrom(BANK);
    const payload = payloadOf({
      ...draft,
      method: 'upi',
      values: { ...draft.values, upiId: 'asha@okaxis' },
    });
    expect(payload).toEqual({ ...NONE, upiId: 'asha@okaxis', pan: 'ABCDE1234F' });
  });

  it('asks for what is missing and checks formats', () => {
    const draft = draftFrom(null);
    const problems = checkDraft({ ...draft, values: { ...draft.values, upiId: 'asha' } }, missing);
    expect(problems).toEqual({ upiId: 'UPI ID must look like name@bank', pan: 'missing pan' });
  });

  it('keeps a masked saved value when its box is left blank', () => {
    const draft = draftFrom({ ...NONE, upiId: 'asha@ok', pan: '••••234F' });
    expect(payloadOf(draft).pan).toBe('••••234F');
    expect(checkDraft(draft, missing)).toEqual({});
  });
});
