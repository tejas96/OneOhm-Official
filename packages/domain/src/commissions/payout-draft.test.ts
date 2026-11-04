import { describe, expect, it } from 'vitest';
import { isMaskedAccount, maskAccount } from './payout-details';
import { checkPayoutDraft, payoutDraftFrom, payoutPayloadOf } from './payout-draft';

const NONE = {
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  upiId: null,
  pan: null,
};
const missing = (field: string) => `missing ${field}`;
/** What a reseller gets back for their own bank details: number and PAN masked. */
const MASKED_BANK = {
  ...NONE,
  bankAccountName: 'ASHA PATIL',
  bankAccountNumber: '••••6789',
  bankIfsc: 'HDFC0001234',
  pan: '••••234F',
};

describe('isMaskedAccount', () => {
  it('recognises what maskAccount produces, and nothing else', () => {
    expect(isMaskedAccount(maskAccount('123456789'))).toBe(true);
    expect(isMaskedAccount('123456789')).toBe(false);
    expect(isMaskedAccount(null)).toBe(false);
  });
});

describe('payoutDraftFrom', () => {
  it('starts on UPI with empty boxes when nothing is saved', () => {
    const draft = payoutDraftFrom(null);
    expect(draft.method).toBe('upi');
    expect(draft.values.upiId).toBe('');
  });

  it('opens on Bank account when bank details are saved', () => {
    expect(payoutDraftFrom(MASKED_BANK).method).toBe('bank');
  });

  it('leaves masked values out of the boxes and keeps them aside', () => {
    const draft = payoutDraftFrom(MASKED_BANK);
    expect(draft.values.bankAccountNumber).toBe('');
    expect(draft.kept.bankAccountNumber).toBe('••••6789');
    expect(draft.values.bankIfsc).toBe('HDFC0001234');
  });
});

describe('payoutPayloadOf', () => {
  it('clears the bank fields when UPI is chosen', () => {
    const draft = payoutDraftFrom(MASKED_BANK);
    const payload = payoutPayloadOf({
      ...draft,
      method: 'upi',
      values: { ...draft.values, upiId: 'asha@okaxis' },
    });
    expect(payload).toEqual({ ...NONE, upiId: 'asha@okaxis', pan: '••••234F' });
  });

  it('clears the UPI ID when Bank account is chosen', () => {
    const draft = payoutDraftFrom({ ...NONE, upiId: 'asha@okaxis' });
    expect(payoutPayloadOf({ ...draft, method: 'bank' }).upiId).toBeNull();
  });
});

describe('checkPayoutDraft', () => {
  it('asks for every missing field of the chosen way, in the app wording', () => {
    const problems = checkPayoutDraft({ ...payoutDraftFrom(null), method: 'bank' }, missing);
    expect(problems).toEqual({
      bankAccountName: 'missing bankAccountName',
      bankAccountNumber: 'missing bankAccountNumber',
      bankIfsc: 'missing bankIfsc',
      pan: 'missing pan',
    });
  });

  it('reports wrong formats with the shared rules', () => {
    const draft = payoutDraftFrom(null);
    const problems = checkPayoutDraft(
      { ...draft, values: { ...draft.values, upiId: 'asha', pan: 'ABC' } },
      missing,
    );
    expect(problems).toEqual({
      upiId: 'UPI ID must look like name@bank',
      pan: 'PAN must look like ABCDE1234F',
    });
  });

  it('lets a bank user change only the IFSC and keeps the stored account number', () => {
    const draft = payoutDraftFrom(MASKED_BANK);
    const changed = { ...draft, values: { ...draft.values, bankIfsc: 'SBIN0004321' } };
    expect(checkPayoutDraft(changed, missing)).toEqual({});
    expect(payoutPayloadOf(changed)).toEqual({ ...MASKED_BANK, bankIfsc: 'SBIN0004321' });
  });

  it('checks a newly typed account number instead of the kept one', () => {
    const draft = payoutDraftFrom(MASKED_BANK);
    const typed = { ...draft, values: { ...draft.values, bankAccountNumber: '12ab' } };
    expect(checkPayoutDraft(typed, missing)).toEqual({
      bankAccountNumber: 'Account number must be 9 to 18 digits',
    });
  });
});
