import type { QuotationSummary } from '@oneohm/api-contracts';
import type { PillTone } from '@oneohm/design-system/web';

export type QuotationStatus = QuotationSummary['status'];

/** Sent quotations wait on the customer; accepted ones are done; rejected ones stop. */
export const STATUS_TONE: Readonly<Record<QuotationStatus, PillTone>> = {
  draft: 'neutral',
  sent: 'waiting',
  accepted: 'done',
  rejected: 'blocked',
  superseded: 'neutral',
};

/** A quotation that can still be sent, accepted or rejected. */
export function isOpen(status: QuotationStatus): boolean {
  return status === 'draft' || status === 'sent';
}
