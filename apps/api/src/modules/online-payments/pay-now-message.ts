import { formatInr } from '@oneohm/shared';
import type { Environment } from '../../config/environment';
import { signPayToken } from './pay-token';

export interface PayNowDetails {
  readonly customerName: string;
  readonly customerId: string;
  readonly projectCode: string;
  readonly milestoneId: string;
  readonly milestoneLabel: string;
  readonly owedPaise: number;
}

/**
 * What a "Pay now" WhatsApp message carries: the figures, and a pay token whose link
 * makes the Razorpay page only when opened (so it never goes stale while unread).
 */
export function payNowPayload(env: Environment, details: PayNowDetails): Record<string, string> {
  const token = signPayToken(env.FILE_LINK_SECRET, {
    milestoneId: details.milestoneId,
    customerId: details.customerId,
    exp: Math.floor(Date.now() / 1000) + env.PAYMENT_LINK_DAYS * 86_400,
  });
  return {
    customer: details.customerName,
    amount: formatInr(details.owedPaise),
    milestone: details.milestoneLabel,
    project: details.projectCode,
    link: `${env.API_PUBLIC_URL}/v1/pay/due/${token}`,
    payToken: token,
  };
}
