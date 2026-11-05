import { MIN_PART_PAISE, partPaymentProblem } from '@oneohm/domain';
import { ApiError } from '@/lib/api/api-error';

/**
 * The live verdict on an amount box in the payout flow, worked out on every keystroke
 * with the same rule the server uses (`partPaymentProblem`).
 *  - empty: nothing typed yet (the button waits, no scolding)
 *  - over: more than what is left; `overBy` says by how much
 *  - problem: any other refusal (below ₹1, nothing left); `message` is the plain sentence
 */
export type AmountCheck =
  | { readonly status: 'ok'; readonly message: null; readonly overBy: 0 }
  | { readonly status: 'empty'; readonly message: null; readonly overBy: 0 }
  | { readonly status: 'over'; readonly message: string; readonly overBy: number }
  | { readonly status: 'problem'; readonly message: string; readonly overBy: 0 };

export function checkAmount(amountPaise: number | null, leftPaise: number): AmountCheck {
  if (amountPaise === null) return { status: 'empty', message: null, overBy: 0 };
  const message = partPaymentProblem(amountPaise, leftPaise);
  if (message === null) return { status: 'ok', message: null, overBy: 0 };
  if (leftPaise > 0 && Number.isInteger(amountPaise) && amountPaise >= MIN_PART_PAISE)
    return { status: 'over', message, overBy: amountPaise - leftPaise };
  return { status: 'problem', message, overBy: 0 };
}

/** True when the Pay / Mark as paid / Ask button may be pressed. */
export const amountIsOk = (check: AmountCheck): boolean => check.status === 'ok';

/** The server's own message about the amount box (say, someone else paid meanwhile), if any. */
export function amountFaultOf(failure: unknown): string | null {
  return failure instanceof ApiError ? (failure.fieldErrors.amountPaise ?? null) : null;
}
