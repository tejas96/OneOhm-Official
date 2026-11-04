'use client';

import type { SignInAttempt } from '@oneohm/api-contracts';
import {
  Button,
  Checkbox,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';

/** Sign-in tries, right or wrong, with where they came from; newest first, a page at a time. */
export function SignInsTable({ search }: { readonly search: string }) {
  const t = useTranslations('settings.activity');
  const format = useFormatter();
  const [failedOnly, setFailedOnly] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ['audit', 'sign-ins', failedOnly, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      expectStatus(
        api.audit.signIns({
          query: {
            failedOnly: failedOnly ? 'true' : 'false',
            limit: 50,
            ...(search ? { search } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
        200,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const columns: readonly TableColumn<SignInAttempt>[] = [
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
      key: 'who',
      header: t('columns.account'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="type-body text-ink">{row.user?.name ?? row.identifier}</span>
          {row.user && (
            <span className="truncate font-mono text-[0.75rem] text-ink-faint">
              {row.identifier}
            </span>
          )}
        </span>
      ),
    },
    { key: 'method', header: t('columns.method'), cell: (row) => t(`methods.${row.method}`) },
    {
      key: 'ip',
      header: t('columns.address'),
      cell: (row) => (
        <span className="font-mono text-[0.75rem] text-ink-faint">{row.ip ?? '—'}</span>
      ),
    },
    {
      key: 'result',
      header: t('columns.result'),
      cell: (row) => (
        <StatusPill
          size="sm"
          tone={row.success ? 'onTrack' : 'overdue'}
          label={row.success ? t('ok') : t('failed')}
        />
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Checkbox checked={failedOnly} onCheckedChange={setFailedOnly} label={t('failedOnly')} />
      {query.isPending && <ListSkeleton label={t('loading')} rows={6} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && rows.length === 0 && (
        <p className="py-6 type-body text-ink-muted">{t('empty')}</p>
      )}
      {rows.length > 0 && (
        <ResponsiveTable
          caption={t('signIns')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
        />
      )}
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
