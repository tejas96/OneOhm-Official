'use client';

import { Badge, type TableColumn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { percentOf } from '../use-purchasing';
import type { VendorRow } from './vendor-filters';

const DASH = <span className="text-ink-faint">—</span>;

/** The vendors list: what was bought, how it arrived, and what is owed or advanced. */
export function useVendorColumns(): readonly TableColumn<VendorRow>[] {
  const t = useTranslations('purchasing.vendors');
  return [
    {
      key: 'vendor',
      header: t('columns.vendor'),
      primary: true,
      cell: ({ vendor }) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <Link
              href={`/inventory/vendors/${vendor.id}`}
              className="oh-stretched-link truncate type-body font-medium text-ink hover:text-accent"
            >
              {vendor.name}
            </Link>
            {!vendor.active && <Badge variant="soft">{t('inactive')}</Badge>}
          </span>
          <span className="type-label text-ink-faint">
            {t('terms', { days: vendor.paymentTermsDays })}
          </span>
        </span>
      ),
    },
    {
      key: 'ordered',
      header: t('columns.ordered'),
      align: 'end',
      cell: ({ card }) =>
        card && card.orders > 0 ? (
          <span className="flex flex-col items-end">
            <span className="font-mono text-ink tabular-nums">{formatInr(card.orderedPaise)}</span>
            <span className="type-label text-ink-faint">{t('orders', { count: card.orders })}</span>
          </span>
        ) : (
          DASH
        ),
    },
    {
      key: 'onTime',
      header: t('columns.onTime'),
      align: 'end',
      cell: ({ card }) =>
        card && card.onTimeBp !== null ? (
          <span className="flex flex-col items-end">
            <span
              className={
                card.onTimeBp < 8000 ? 'text-at-risk tabular-nums' : 'text-ink tabular-nums'
              }
            >
              {percentOf(card.onTimeBp)}
            </span>
            <span className="whitespace-nowrap type-label text-ink-faint">
              {t('onTimeOf', {
                onTime: card.onTime,
                total: card.onTime + card.late + card.openLate,
              })}
            </span>
          </span>
        ) : (
          DASH
        ),
    },
    {
      key: 'days',
      header: t('columns.days'),
      align: 'end',
      hideOnPhone: true,
      cell: ({ card }) =>
        card?.averageDaysToDeliver != null ? (
          <span className="whitespace-nowrap text-ink tabular-nums">
            {t('days', { days: card.averageDaysToDeliver })}
          </span>
        ) : (
          DASH
        ),
    },
    {
      key: 'inspection',
      header: t('columns.inspection'),
      align: 'end',
      hideOnPhone: true,
      cell: ({ card }) =>
        card && card.receipts > 0 ? (
          <span
            className={
              card.inspectionFailures > 0
                ? 'whitespace-nowrap text-at-risk'
                : 'whitespace-nowrap text-ink-muted'
            }
          >
            {t('failures', { failed: card.inspectionFailures, receipts: card.receipts })}
          </span>
        ) : (
          DASH
        ),
    },
    {
      key: 'outstanding',
      header: t('columns.outstanding'),
      align: 'end',
      cell: ({ card }) =>
        card && card.outstandingPaise > 0 ? (
          <span className="flex flex-col items-end">
            <span className="font-mono text-ink tabular-nums">
              {formatInr(card.outstandingPaise)}
            </span>
            {card.overduePaise > 0 && (
              <span className="whitespace-nowrap type-label text-overdue">
                {t('overdue', { amount: formatInr(card.overduePaise) })}
              </span>
            )}
          </span>
        ) : (
          DASH
        ),
    },
    {
      key: 'advances',
      header: t('columns.advances'),
      align: 'end',
      cell: ({ card }) =>
        card && card.openAdvancesPaise > 0 ? (
          <span className="font-mono text-ink tabular-nums">
            {formatInr(card.openAdvancesPaise)}
          </span>
        ) : (
          DASH
        ),
    },
  ];
}
