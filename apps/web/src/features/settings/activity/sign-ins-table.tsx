'use client';

import type { SignInAttempt } from '@oneohm/api-contracts';
import { Checkbox, ResponsiveTable, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';

/** The last 100 sign-in tries, right or wrong, with where they came from. */
export function SignInsTable() {
  const t = useTranslations('settings.activity');
  const format = useFormatter();
  const [failedOnly, setFailedOnly] = useState(false);
  const query = useQuery({
    queryKey: ['audit', 'sign-ins', failedOnly],
    queryFn: () =>
      expectStatus(
        api.audit.signIns({ query: { failedOnly: failedOnly ? 'true' : 'false' } }),
        200,
      ),
  });
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
      {query.data && query.data.length === 0 && (
        <p className="py-6 type-body text-ink-muted">{t('empty')}</p>
      )}
      {query.data && query.data.length > 0 && (
        <ResponsiveTable
          caption={t('signIns')}
          columns={columns}
          rows={query.data}
          rowKey={(row) => row.id}
        />
      )}
    </div>
  );
}
