import { useTranslations } from 'next-intl';
import { type AmountCheck, amountIsOk, checkAmount } from './amount-check';
import { checkText, utrLooksOff } from './text-check';

export const REFERENCE_MAX = 120;

export interface PayBillChecks {
  readonly amount: AmountCheck;
  /** Which message the paid-on box shows, if any. */
  readonly date: 'required' | 'future' | null;
  readonly referenceTooLong: boolean;
  /** Which hint sits under the reference box (a UTR hint never blocks). */
  readonly referenceHint: 'count' | 'utrOff' | 'utr' | 'plain';
  readonly referenceLength: number;
  /** Every rule is met: the button may be pressed. */
  readonly ready: boolean;
}

/** The live rules of "Record a payment made", worked out on every change. */
export function checkPayBill(input: {
  readonly amount: number | null;
  readonly left: number;
  readonly paidOn: string;
  readonly today: string;
  readonly method: string;
  readonly reference: string;
}): PayBillChecks {
  const amount = checkAmount(input.amount, input.left);
  const date = !input.paidOn ? 'required' : input.paidOn > input.today ? 'future' : null;
  const text = checkText(input.reference, 0, REFERENCE_MAX);
  const wantsUtr = input.method === 'bank_transfer' || input.method === 'upi';
  const referenceHint = text.showCounter
    ? 'count'
    : wantsUtr
      ? utrLooksOff(input.reference)
        ? 'utrOff'
        : 'utr'
      : 'plain';
  const referenceTooLong = text.problem === 'long';
  return {
    amount,
    date,
    referenceTooLong,
    referenceHint,
    referenceLength: text.length,
    ready: amountIsOk(amount) && date === null && !referenceTooLong,
  };
}

/** The plain words for those checks: the date and reference problems and the reference hint. */
export function usePayBillTexts(checks: PayBillChecks) {
  const t = useTranslations('finance.payables.payDialog');
  const checkT = useTranslations('checks');
  const dateProblem =
    checks.date === 'required'
      ? checkT('required')
      : checks.date === 'future'
        ? checkT('dateNotFuture')
        : null;
  const hints = {
    count: t('referenceCount', { used: checks.referenceLength, max: REFERENCE_MAX }),
    utrOff: t('referenceUtrOff'),
    utr: t('referenceUtr'),
    plain: t('referenceHint'),
  };
  return {
    dateProblem,
    referenceProblem: checks.referenceTooLong ? t('referenceLong', { max: REFERENCE_MAX }) : null,
    referenceHint: hints[checks.referenceHint],
  };
}
