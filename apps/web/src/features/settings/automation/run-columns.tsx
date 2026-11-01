'use client';

import type { JobRunRecord } from '@oneohm/api-contracts';
import { Button, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { RotateCcw } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';

const TONE = {
  succeeded: 'done',
  failed: 'overdue',
  running: 'review',
  queued: 'waiting',
} as const;

/** How long a run took, in plain words. */
function took(run: JobRunRecord): number | null {
  if (!run.startedAt || !run.finishedAt) return null;
  return Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
}

/** Columns for the runs table: the job, when, and how it went, with a retry when it is safe. */
export function useRunColumns(
  onRetry: (run: JobRunRecord) => void,
  retrying: string | null,
): readonly TableColumn<JobRunRecord>[] {
  const t = useTranslations('settings.automation');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return [
    {
      key: 'job',
      header: t('columns.job'),
      primary: true,
      cell: (run) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-body font-medium text-ink">{t(`jobs.${run.name}`)}</span>
          <span className="type-body-sm text-ink-faint">{t(`triggers.${run.trigger}`)}</span>
        </span>
      ),
    },
    {
      key: 'when',
      header: t('columns.when'),
      cell: (run) => {
        const at = run.startedAt ?? run.createdAt;
        const ms = took(run);
        return (
          <span className="flex flex-col gap-0.5 type-body-sm">
            <time
              dateTime={at}
              title={format.dateTime(new Date(at), { dateStyle: 'medium', timeStyle: 'short' })}
            >
              {format.relativeTime(new Date(at), now)}
            </time>
            {ms !== null && (
              <span className="text-ink-faint tabular-nums">
                {ms < 1000 ? t('tookUnderSecond') : t('took', { seconds: Math.round(ms / 1000) })}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'result',
      header: t('columns.result'),
      cell: (run) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <StatusPill size="sm" tone={TONE[run.status]} label={t(`status.${run.status}`)} />
          {run.status === 'succeeded' && run.result !== null && (
            <span className="type-body-sm text-ink-muted">
              {t(`results.${run.name}`, { count: Number(run.result) || 0 })}
            </span>
          )}
          {run.error && <span className="type-body-sm break-words text-overdue">{run.error}</span>}
          {run.retried && <span className="type-body-sm text-ink-faint">{t('retried')}</span>}
          {run.retryable && (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<RotateCcw />}
              pending={retrying === run.id}
              onClick={() => onRetry(run)}
              className="mt-1"
            >
              {t('retry')}
            </Button>
          )}
        </span>
      ),
    },
  ];
}
