'use client';

import type { BankPayout, Payable } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { BILL_TONE, billStatus } from './payout-status';

/** The one status of a bill: To pay, Sending, Part paid, Paid, Came back or Failed. */
export function BillStatusPill({
  bill,
  latest,
}: {
  readonly bill: Payable;
  readonly latest: BankPayout | undefined;
}) {
  const t = useTranslations('finance.payables.status');
  const status = billStatus(bill, latest);
  const reason =
    status === 'failed' || status === 'cameBack' ? (latest?.failureReason ?? undefined) : undefined;
  return (
    <span title={reason}>
      <StatusPill size="sm" tone={BILL_TONE[status]} label={t(status)} />
    </span>
  );
}
