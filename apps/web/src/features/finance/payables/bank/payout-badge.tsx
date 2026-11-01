'use client';

import type { BankPayout, Payable } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/design-system/web';
import { payoutFailed, payoutOpen } from '@oneohm/domain';
import { useTranslations } from 'next-intl';

/** On a bill in the list: a bank transfer on its way, or the last one that failed. */
export function PayoutBadge({
  bill,
  latest,
}: {
  readonly bill: Payable;
  readonly latest: BankPayout | undefined;
}) {
  const t = useTranslations('finance.payables.bank');
  if (!latest || bill.status !== 'approved') return null;
  if (payoutOpen(latest.status))
    return <StatusPill size="sm" tone="review" label={t('onItsWay')} />;
  if (payoutFailed(latest.status))
    return (
      <span className="type-label text-overdue" title={latest.failureReason ?? undefined}>
        {t('failedShort')}
      </span>
    );
  return null;
}

/** The newest payout of each bill. */
export function latestByBill(payouts: readonly BankPayout[]): ReadonlyMap<string, BankPayout> {
  const map = new Map<string, BankPayout>();
  for (const payout of payouts) if (!map.has(payout.payableId)) map.set(payout.payableId, payout);
  return map;
}
