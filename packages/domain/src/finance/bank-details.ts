import { isValidAccountNumber, isValidIfsc } from './bank-payouts';

/**
 * The one rule set for bank details saved on a vendor or contractor (payouts send money
 * here, so one wrong digit is money in the wrong account). The server and every screen
 * use these, so a number that saves is a number that can later be paid.
 */

/** Typed IFSC: spaces dropped, upper case. */
export const cleanIfsc = (value: string): string => value.replace(/\s+/g, '').toUpperCase();

/** Typed account number: spaces dropped. */
export const cleanAccountNumber = (value: string): string => value.replace(/\s+/g, '');

export type BankProblem =
  | 'ifsc_length'
  | 'ifsc_zero'
  | 'ifsc_format'
  | 'number_digits'
  | 'number_length'
  | 'name_required'
  | 'name_length'
  | 'confirm_required'
  | 'confirm_mismatch';

/** Plain English for each problem; screens translate the code, the server uses this. */
export const BANK_PROBLEM_TEXT: Readonly<Record<BankProblem, string>> = {
  ifsc_length: 'An IFSC has 11 characters.',
  ifsc_zero: 'The 5th character of an IFSC is the number 0.',
  ifsc_format: 'Enter a valid IFSC, like SBIN0001234.',
  number_digits: 'Use digits only.',
  number_length: 'An account number has 9 to 18 digits.',
  name_required: 'Enter the name on the bank account.',
  name_length: 'The name on the account has 2 to 120 characters.',
  confirm_required: 'Type the account number again.',
  confirm_mismatch: 'Numbers do not match.',
};

/** Null when the IFSC is fine. A blank IFSC is not judged here. */
export function ifscProblem(value: string): BankProblem | null {
  const ifsc = cleanIfsc(value);
  if (ifsc === '') return null;
  if (ifsc.length !== 11) return 'ifsc_length';
  if (ifsc.charAt(4) !== '0') return 'ifsc_zero';
  return isValidIfsc(ifsc) ? null : 'ifsc_format';
}

/** Null when the account number is fine. A blank number is not judged here. */
export function accountNumberProblem(value: string): BankProblem | null {
  const number = cleanAccountNumber(value);
  if (number === '') return null;
  if (!/^\d+$/.test(number)) return 'number_digits';
  return isValidAccountNumber(number) ? null : 'number_length';
}

export function accountNameProblem(value: string, required: boolean): BankProblem | null {
  const name = value.trim();
  if (name === '') return required ? 'name_required' : null;
  return name.length < 2 || name.length > 120 ? 'name_length' : null;
}

export interface BankInput {
  readonly name?: string | null | undefined;
  readonly ifsc?: string | null | undefined;
  /** A NEW number being typed; blank or missing keeps the saved one. */
  readonly number?: string | null | undefined;
  readonly confirm?: string | null | undefined;
}

export type BankField = 'name' | 'ifsc' | 'number' | 'confirm';

/**
 * Every problem with what was typed, by field. The name is required whenever a new number
 * is given (`nameRequired`, false when the caller checks the saved name itself); the
 * second typing of the number is required then too, and must match.
 */
export function bankProblems(
  input: BankInput,
  options: { readonly nameRequired?: boolean } = {},
): Partial<Record<BankField, BankProblem>> {
  const out: Partial<Record<BankField, BankProblem>> = {};
  const number = cleanAccountNumber(input.number ?? '');
  const hasNumber = number !== '';
  const ifsc = ifscProblem(input.ifsc ?? '');
  if (ifsc) out.ifsc = ifsc;
  const numberProblem = accountNumberProblem(number);
  if (numberProblem) out.number = numberProblem;
  const name = accountNameProblem(input.name ?? '', hasNumber && options.nameRequired !== false);
  if (name) out.name = name;
  if (hasNumber) {
    const again = cleanAccountNumber(input.confirm ?? '');
    if (again === '') out.confirm = 'confirm_required';
    else if (again !== number) out.confirm = 'confirm_mismatch';
  }
  return out;
}
