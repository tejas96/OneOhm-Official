import { describe, expect, it } from 'vitest';
import { bankBody, bankDraftProblems, EMPTY_BANK } from './bank-check';

const typed = {
  ...EMPTY_BANK,
  bankAccountName: ' Asha Traders ',
  bankIfsc: 'sbin 0001234',
  bankAccountNumber: '1234 5678 9012',
  bankAccountNumberConfirm: '123456789012',
};

describe('bank form values', () => {
  it('has no problems when the number is typed twice', () => {
    expect(bankDraftProblems(typed)).toEqual({});
  });
  it('shows a mismatch as you type the second number', () => {
    expect(bankDraftProblems({ ...typed, bankAccountNumberConfirm: '12345678' }).confirm).toBe(
      'confirm_mismatch',
    );
  });
  it('asks nothing of an untouched form', () => {
    expect(bankDraftProblems(EMPTY_BANK)).toEqual({});
  });
  it('sends clean values and the second typing with a new number', () => {
    expect(bankBody(typed)).toEqual({
      bankAccountName: 'Asha Traders',
      bankIfsc: 'SBIN0001234',
      bankAccountNumber: '123456789012',
      bankAccountNumberConfirm: '123456789012',
    });
  });
  it('sends no number when none was typed', () => {
    expect(bankBody({ ...typed, bankAccountNumber: '', bankAccountNumberConfirm: '' })).toEqual({
      bankAccountName: 'Asha Traders',
      bankIfsc: 'SBIN0001234',
    });
  });
});
