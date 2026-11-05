import type { PayoutStatus } from './bank-payouts';

/** What RazorpayX says about a payout: `status_details` and the older `failure_reason`. */
export interface PayoutReasonInput {
  readonly details?:
    | {
        readonly reason?: string | null;
        readonly description?: string | null;
      }
    | null
    | undefined;
  readonly failureReason?: string | null | undefined;
}

/** RazorpayX can keep the old "processed" words on a payout that later came back. */
const SUCCESS_TEXT = /money has been credited/i;
const STALE_SUCCESS = (reason?: string | null, description?: string | null) =>
  reason === 'payout_processed' || SUCCESS_TEXT.test(description ?? '');

/** Words that tell the owner nothing they can act on. */
const UNHELPFUL = /contact support/i;

/** OneOhm's own plain reasons: each already says what to do next. */
export const PAYOUT_PLAIN_REASONS = {
  reversed: 'The bank sent the money back. Check the bank details with the payee, then pay again.',
  other: 'The bank did not accept it. Check the bank details with the payee, then pay again.',
} as const;

/**
 * The reason a payout failed or came back, in words the owner can act on, and RazorpayX's
 * reason code. A leftover success message or a "contact support" line is never shown.
 */
export function payoutProblemReason(
  input: PayoutReasonInput,
  reported: PayoutStatus,
): { readonly text: string; readonly code: string | null } {
  const reason = input.details?.reason ?? null;
  const description = input.details?.description ?? null;
  const stale = STALE_SUCCESS(reason, description);
  const said = [stale ? null : description, input.failureReason].find(
    (text): text is string =>
      Boolean(text?.trim()) && !UNHELPFUL.test(text ?? '') && !SUCCESS_TEXT.test(text ?? ''),
  );
  const fallback =
    reported === 'reversed' ? PAYOUT_PLAIN_REASONS.reversed : PAYOUT_PLAIN_REASONS.other;
  return { text: said ?? fallback, code: stale ? null : reason };
}
