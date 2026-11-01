'use client';

import type { ChangeRequestSummary } from '@oneohm/api-contracts';
import {
  EmptyState,
  type PillTone,
  ResponsiveTable,
  SegmentedControl,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { FileCog } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useChangeRequests } from './use-discom';

type Filter = 'open' | 'completed' | 'cancelled';

export const REQUEST_TONE: Readonly<Record<ChangeRequestSummary['status'], PillTone>> = {
  open: 'waiting',
  completed: 'done',
  cancelled: 'neutral',
};

/** Utility change requests, open first, with the step each is on. */
export function ChangeRequestsList() {
  const t = useTranslations('discom.requests');
  const format = useFormatter();
  const [filter, setFilter] = useState<Filter>('open');
  const query = useChangeRequests({ status: filter });

  const columns: TableColumn<ChangeRequestSummary>[] = [
    {
      key: 'request',
      header: t('columns.request'),
      primary: true,
      cell: (request) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/discom/change-requests/${request.id}`}
            className="type-body-sm font-medium text-ink hover:text-accent"
          >
            {request.title}
          </Link>
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {request.number}
            {request.referenceNumber && ` · ${request.referenceNumber}`}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: t('columns.customer'),
      cell: (request) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate type-body-sm text-ink">{request.customer.name}</span>
          <span className="truncate type-label text-ink-faint">
            {request.project
              ? request.project.code
              : `${request.property.label}, ${request.property.city}`}
          </span>
        </span>
      ),
    },
    {
      key: 'step',
      header: t('columns.step'),
      cell: (request) =>
        request.currentStep ? (
          <span className="flex flex-col">
            <span className="type-body-sm text-ink">{request.currentStep.title}</span>
            <span className="type-label text-ink-faint">
              {t('stepOf', { done: request.stepsDone, total: request.stepsTotal })}
            </span>
          </span>
        ) : (
          <StatusPill
            size="sm"
            tone={REQUEST_TONE[request.status]}
            label={t(`status.${request.status}`)}
          />
        ),
    },
    {
      key: 'raised',
      header: t('columns.raised'),
      hideOnPhone: true,
      align: 'end',
      cell: (request) => (
        <time dateTime={request.createdAt} className="type-body-sm text-ink-muted">
          {format.dateTime(new Date(request.createdAt), { day: 'numeric', month: 'short' })}
        </time>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl
        label={t('filter')}
        value={filter}
        onValueChange={setFilter}
        options={(['open', 'completed', 'cancelled'] as const).map((value) => ({
          value,
          label: t(`status.${value}`),
        }))}
        className="w-fit"
      />
      {query.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data?.length === 0 && (
        <EmptyState icon={<FileCog />} title={t('emptyTitle')} description={t('emptyBody')} />
      )}
      {query.data && query.data.length > 0 && (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={query.data}
          rowKey={(row) => row.id}
        />
      )}
    </div>
  );
}
