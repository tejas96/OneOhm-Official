import type { SettingErrors } from './settings-check';

/**
 * Money settings for bank transfers. The RazorpayX fee per payout is whatever the owner's
 * plan charges, so it is empty (unknown) until they enter it; nothing is guessed.
 */
export interface PaymentSettings {
  /** What RazorpayX charges per payout, in paise, before GST. Null means not known. */
  readonly razorpayxFeePaise: number | null;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = { razorpayxFeePaise: null };

/** GST on the RazorpayX fee. */
export const PAYOUT_FEE_GST_PERCENT = 18;

/** ₹1,000: a fee above this is almost certainly a typo. */
const MAX_FEE_PAISE = 1_00_000;

export function checkPaymentSettings(settings: PaymentSettings): SettingErrors {
  const fee = settings.razorpayxFeePaise;
  if (fee === null) return {};
  return Number.isInteger(fee) && fee >= 0 && fee <= MAX_FEE_PAISE
    ? {}
    : {
        razorpayxFeePaise: 'Use an amount from ₹0 to ₹1,000, or leave it empty if you do not know.',
      };
}

/** The fee and its GST, both in paise; null while the fee is not known. */
export function feeEstimate(
  feePaise: number | null,
): { readonly feePaise: number; readonly gstPaise: number } | null {
  if (feePaise === null) return null;
  return { feePaise, gstPaise: Math.round((feePaise * PAYOUT_FEE_GST_PERCENT) / 100) };
}
