'use client';

import type { CustomerMoneyEntry } from '@oneohm/api-contracts';
import { Badge } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * A refund or an overpayment held as credit, in the same row shape as a payment
 * received. Refunds read as money out.
 */
export function MoneyEntryItem({ entry }: { readonly entry: CustomerMoneyEntry }) {
  const t = useTranslations('finance.billing.credit');
  const methodT = useTranslations('finance.methods');
  const format = useFormatter();
  const refund = entry.kind === 'refund';
  return (
    <li className="grid gap-x-4 gap-y-1 px-5 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${entry.projectId}?tab=payments`}
            className="truncate type-body font-medium text-ink hover:text-accent"
          >
            {entry.customerName}
          </Link>
          <Badge variant={refund ? 'outline' : 'energy'}>{t(`kind.${entry.kind}`)}</Badge>
        </span>
        <span className="truncate font-mono text-[0.75rem] text-ink-faint">
          {[entry.reference, entry.projectCode].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="flex flex-col type-body-sm text-ink-muted">
        <span>
          {format.dateTime(new Date(`${entry.date}T12:00:00`), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}{' '}
          · {methodT(entry.method)}
        </span>
        <span className="truncate text-ink-faint">
          {refund ? entry.reason : (entry.milestoneLabel ?? '')}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span
          className={
            refund ? 'font-mono text-overdue tabular-nums' : 'font-mono text-ink tabular-nums'
          }
        >
          {refund ? `−${formatInr(entry.amountPaise)}` : formatInr(entry.amountPaise)}
        </span>
        <span aria-hidden className="size-8" />
      </div>
    </li>
  );
}
