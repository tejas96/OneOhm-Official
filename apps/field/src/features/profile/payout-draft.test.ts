import { describe, expect, it } from 'vitest';
import { checkDraft, draftFrom, payloadOf } from './payout-draft';

const NONE = {
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  upiId: null,
  pan: null,
};

describe('draftFrom', () => {
  it('starts on UPI with empty boxes when nothing is saved', () => {
    const draft = draftFrom(null);
    expect(draft.method).toBe('upi');
    expect(draft.values.upiId).toBe('');
  });

  it('opens on Bank account when bank details are saved', () => {
    const draft = draftFrom({ ...NONE, bankAccountName: 'ASHA', bankIfsc: 'HDFC0001234' });
    expect(draft.method).toBe('bank');
    expect(draft.values.bankAccountName).toBe('ASHA');
  });

  it('leaves masked values out of the boxes and keeps them aside', () => {
    const draft = draftFrom({ ...NONE, pan: '••••234F', upiId: 'asha@okaxis' });
    expect(draft.values.pan).toBe('');
    expect(draft.kept.pan).toBe('••••234F');
    expect(draft.values.upiId).toBe('asha@okaxis');
  });
});

describe('payloadOf', () => {
  it('sends a kept masked value back when its box is left blank', () => {
    const draft = draftFrom({ ...NONE, pan: '••••234F', upiId: 'asha@okaxis' });
    expect(payloadOf(draft).pan).toBe('••••234F');
  });

  it('clears the bank fields when UPI is chosen', () => {
    const draft = draftFrom({
      ...NONE,
      bankAccountName: 'ASHA',
      bankAccountNumber: '••••6789',
      bankIfsc: 'HDFC0001234',
    });
    const payload = payloadOf({
      ...draft,
      method: 'upi',
      values: { ...draft.values, upiId: 'a@ok' },
    });
    expect(payload).toMatchObject({
      bankAccountName: null,
      bankAccountNumber: null,
      bankIfsc: null,
      upiId: 'a@ok',
    });
  });

  it('clears the UPI ID when Bank account is chosen', () => {
    const draft = draftFrom({ ...NONE, upiId: 'asha@okaxis' });
    expect(payloadOf({ ...draft, method: 'bank' }).upiId).toBeNull();
  });
});

describe('checkDraft', () => {
  it('asks for every missing field of the chosen way', () => {
    const problems = checkDraft({ ...draftFrom(null), method: 'bank' });
    expect(Object.keys(problems).sort()).toEqual([
      'bankAccountName',
      'bankAccountNumber',
      'bankIfsc',
      'pan',
    ]);
  });

  it('reports a wrong format from the shared rules', () => {
    const draft = draftFrom(null);
    const problems = checkDraft({
      ...draft,
      values: { ...draft.values, upiId: 'asha', pan: 'ABC' },
    });
    expect(problems.upiId).toBe('UPI ID must look like name@bank');
    expect(problems.pan).toBe('PAN must look like ABCDE1234F');
  });

  it('accepts a kept masked PAN without asking again', () => {
    const draft = draftFrom({ ...NONE, pan: '••••234F', upiId: 'asha@okaxis' });
    expect(checkDraft(draft)).toEqual({});
  });
});
