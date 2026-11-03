'use client';

import type { AuditEntry } from '@oneohm/api-contracts';
import { Badge, Button, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { readableAction, summarise } from './audit-format';
import { ChangeSheet } from './change-sheet';

/** The audit trail, newest first, 50 at a time. */
export function ChangesTable({ search }: { readonly search: string }) {
  const t = useTranslations('settings.activity');
  const format = useFormatter();
  const [opened, setOpened] = useState<AuditEntry | null>(null);
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
      className: 'w-px whitespace-nowrap',
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
      className: 'w-full max-w-0',
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setOpened(row)}
            className="oh-stretched-link truncate text-left type-body font-medium text-ink hover:text-accent"
          >
            {readableAction(row.action)}
          </button>
          <span className="truncate type-body-sm text-ink-faint">{summarise(row.data)}</span>
        </span>
      ),
    },
    {
      key: 'who',
      header: t('columns.who'),
      className: 'w-px whitespace-nowrap',
      cell: (row) => (
        <span className="type-body-sm text-ink">{row.actor?.name ?? t('system')}</span>
      ),
    },
    {
      key: 'record',
      header: t('columns.record'),
      className: 'w-px whitespace-nowrap',
      cell: (row) => (
        <span className="flex items-center gap-2">
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
      <ChangeSheet entry={opened} onClose={() => setOpened(null)} />
    </div>
  );
}
