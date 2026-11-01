'use client';

import type { Receivable } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  EmptyState,
  type PillTone,
  ResponsiveTable,
  SegmentedControl,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { PaymentLinkAction } from '../payment-link-action';
import { useReceivables } from '../use-finance';
import { GatewayCheckButton } from './gateway-check-button';
import { PaymentsReceived } from './payments-received';

type Filter = 'due' | 'not_due' | 'all';

const NEXT_TONE: Readonly<Record<Receivable['nextAction'], PillTone>> = {
  collect_from_customer: 'review',
  claim_from_bank: 'waiting',
  not_due_yet: 'neutral',
};

/** Every milestone still owed, oldest first, with the one thing to do about it. */
export function ReceivablesTab() {
  const t = useTranslations('finance.receivables');
  const format = useFormatter();
  const [filter, setFilter] = useState<Filter>('due');
  const query = useReceivables();

  const columns: TableColumn<Receivable>[] = [
    {
      key: 'project',
      header: t('columns.project'),
      primary: true,
      cell: (row) => (
        <span className="flex flex-col">
          <Link
            href={`/projects/${row.projectId}?tab=payments`}
            className="oh-stretched-link type-body font-medium text-ink hover:text-accent"
          >
            {row.customerName}
          </Link>
          <span className="font-mono text-[0.75rem] text-ink-faint">{row.projectCode}</span>
        </span>
      ),
    },
    {
      key: 'milestone',
      header: t('columns.milestone'),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2 type-body-sm text-ink-muted">
          {row.label}
          {row.payer === 'bank' && <Badge variant="soft">{t('bank')}</Badge>}
        </span>
      ),
    },
    {
      key: 'outstanding',
      header: t('columns.outstanding'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col items-end">
          <span className="font-mono text-ink tabular-nums">{formatInr(row.outstandingPaise)}</span>
          {row.paidPaise !== 0 && (
            <span className="type-label text-ink-faint">
              {t('ofAmount', { amount: formatInr(row.amountPaise) })}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'due',
      header: t('columns.due'),
      cell: (row) =>
        row.dueOn ? (
          <span className="flex flex-col type-body-sm">
            <time dateTime={row.dueOn} className="text-ink">
              {format.dateTime(new Date(`${row.dueOn}T12:00:00`), {
                day: 'numeric',
                month: 'short',
              })}
            </time>
            <span className="text-ink-faint">{t('daysAgo', { count: row.daysSinceDue ?? 0 })}</span>
          </span>
        ) : (
          <span className="type-body-sm text-ink-faint">{t('onTrigger')}</span>
        ),
    },
    {
      key: 'next',
      header: t('columns.next'),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill
            size="sm"
            tone={NEXT_TONE[row.nextAction]}
            label={t(`next.${row.nextAction}`)}
          />
          {row.nextAction === 'collect_from_customer' && (
            <>
              <PaymentLinkAction milestoneId={row.milestoneId} link={row.link} />
              <Button asChild size="sm" variant="secondary" className="relative z-[2]">
                <Link href={`/projects/${row.projectId}?tab=payments`}>{t('record')}</Link>
              </Button>
            </>
          )}
          {row.nextAction === 'claim_from_bank' && (
            <Button asChild size="sm" variant="secondary" className="relative z-[2]">
              <Link href="/finance?tab=loans">{t('claim')}</Link>
            </Button>
          )}
        </span>
      ),
    },
  ];

  const rows = (query.data ?? []).filter((row) =>
    filter === 'all' ? true : filter === 'due' ? row.dueOn !== null : row.dueOn === null,
  );

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-title-lg text-ink [font-family:var(--font-display)]">{t('title')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <GatewayCheckButton />
            <SegmentedControl
              value={filter}
              onValueChange={setFilter}
              label={t('filterLabel')}
              size="sm"
              options={(['due', 'not_due', 'all'] as const).map((value) => ({
                value,
                label: t(`filters.${value}`),
              }))}
            />
          </div>
        </div>
        {query.isPending ? (
          <ListSkeleton label={t('loading')} />
        ) : query.isError ? (
          <LoadError error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<CircleCheck />} title={t('emptyTitle')} description={t('emptyBody')} />
        ) : (
          <ResponsiveTable
            caption={t('title')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.milestoneId}
          />
        )}
      </section>
      <PaymentsReceived />
    </div>
  );
}
