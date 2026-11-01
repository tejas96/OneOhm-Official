'use client';

import type { AuditEntry } from '@oneohm/api-contracts';
import { Badge, Button, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';

/** "quotation.discount_approved" → "Quotation discount approved". */
export function readableAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function details(data: AuditEntry['data']): string {
  if (!data) return '';
  return Object.entries(data)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .map(([key, value]) =>
      key.endsWith('Paise') && typeof value === 'number'
        ? `${key.slice(0, -'Paise'.length)}: ${formatInr(value)}`
        : `${key}: ${String(value)}`,
    )
    .join(' · ');
}

/** The audit trail, newest first, 50 at a time. */
export function ChangesTable({ search }: { readonly search: string }) {
  const t = useTranslations('settings.activity');
  const format = useFormatter();
  const query = useInfiniteQuery({
    queryKey: ['audit', 'activity', search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      expectStatus(
        api.audit.activity({
          query: { ...(search ? { search } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
        }),
        200,
      ),
    getNextPageParam: (page) => page.cursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const columns: readonly TableColumn<AuditEntry>[] = [
    {
      key: 'when',
      header: t('columns.when'),
      cell: (row) => (
        <span className="type-body-sm text-ink-muted tabular-nums">
          {format.dateTime(new Date(row.at), {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'what',
      header: t('columns.what'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="type-body font-medium text-ink">{readableAction(row.action)}</span>
          <span className="truncate type-body-sm text-ink-faint">{details(row.data)}</span>
        </span>
      ),
    },
    {
      key: 'who',
      header: t('columns.who'),
      cell: (row) => (
        <span className="type-body-sm text-ink">{row.actor?.name ?? t('system')}</span>
      ),
    },
    {
      key: 'record',
      header: t('columns.record'),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{row.entity.replace(/_/g, ' ')}</Badge>
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {row.entityId.slice(0, 8)}
          </span>
        </span>
      ),
    },
  ];
  if (query.isPending) return <ListSkeleton label={t('loading')} rows={8} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (rows.length === 0) return <p className="py-6 type-body text-ink-muted">{t('empty')}</p>;
  return (
    <div className="flex flex-col gap-4">
      <ResponsiveTable
        caption={t('changes')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
      />
      {query.hasNextPage && (
        <Button
          variant="secondary"
          className="self-center"
          pending={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t('more')}
        </Button>
      )}
    </div>
  );
}
