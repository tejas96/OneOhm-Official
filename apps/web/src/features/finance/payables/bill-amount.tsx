'use client';

import type { Payable } from '@oneohm/api-contracts';
import type { InvoiceMatch } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * How the vendor's invoice compares with the order amount. A mismatch is shown calmly,
 * in amber, so the approver looks before approving; a match is a quiet tick.
 */
export function InvoiceFlag({
  match,
  compact = false,
}: {
  readonly match: InvoiceMatch;
  readonly compact?: boolean;
}) {
  const t = useTranslations('finance.payables.invoice');
  if (match.status === 'not_entered') return null;
  const amount = formatInr(Math.abs(match.differencePaise));
  if (match.status === 'matches') {
    return (
      <span className="inline-flex items-center gap-1 type-label text-ink-faint">
        <CircleCheck aria-hidden className="size-3.5 text-on-track" />
        {t('matches')}
      </span>
    );
  }
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap type-label text-at-risk">
        <CircleAlert aria-hidden className="size-3.5" />
        {t(`${match.status}Short`, { amount })}
      </span>
    );
  }
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
      {t(match.status, { amount })}
    </p>
  );
}

/** The bill's amount, with TDS held, advance used and the invoice check under it. */
export function BillAmount({ bill }: { readonly bill: Payable }) {
  const t = useTranslations('finance.payables');
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-ink tabular-nums">{formatInr(bill.amountPaise)}</span>
      {bill.tdsPaise > 0 && (
        <span className="whitespace-nowrap type-label text-ink-faint">
          {t('tdsHeld', { amount: formatInr(bill.tdsPaise) })}
        </span>
      )}
      {bill.advanceAdjustedPaise > 0 && (
        <span className="whitespace-nowrap type-label text-ink-faint">
          {t('advanceAdjusted', { amount: formatInr(bill.advanceAdjustedPaise) })}
        </span>
      )}
      {bill.paidPaise > 0 && bill.status !== 'paid' && (
        <span className="whitespace-nowrap type-label text-ink-faint">
          {t('paidOfTotal', {
            paid: formatInr(bill.paidPaise),
            total: formatInr(bill.toPayPaise),
          })}
        </span>
      )}
      <InvoiceFlag match={bill.invoiceMatch} compact />
    </span>
  );
}
