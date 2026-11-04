'use client';

import type { JobRunRecord } from '@oneohm/api-contracts';
import { Button, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { RotateCcw } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { runsTodaysJob, took } from './run-format';

export const RUN_TONE = {
  succeeded: 'done',
  failed: 'overdue',
  running: 'review',
  queued: 'waiting',
} as const;

/** How a run went; a failure the job later put right reads as such, not as a red failure. */
export function RunPill({ run }: { readonly run: JobRunRecord }) {
  const t = useTranslations('settings.automation');
  return run.recovered ? (
    <StatusPill size="sm" tone="waiting" label={t('recovered')} />
  ) : (
    <StatusPill size="sm" tone={RUN_TONE[run.status]} label={t(`status.${run.status}`)} />
  );
}

/** Columns for the runs table: the job, when, and how it went, with a retry when it is safe. */
export function useRunColumns(
  onRetry: (run: JobRunRecord) => void,
  retrying: string | null,
  onOpen: (run: JobRunRecord) => void,
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
          <button
            type="button"
            onClick={() => onOpen(run)}
            className="oh-stretched-link text-left type-body font-medium text-ink hover:text-accent"
          >
            {t(`jobs.${run.name}`)}
          </button>
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
          <RunPill run={run} />
          {run.status === 'succeeded' && run.result !== null && (
            <span className="type-body-sm text-ink-muted">
              {t(`results.${run.name}`, { count: Number(run.result) || 0 })}
            </span>
          )}
          {run.error && (
            <span className="line-clamp-2 type-body-sm break-words text-overdue" title={run.error}>
              {run.error}
            </span>
          )}
          {run.retried && <span className="type-body-sm text-ink-faint">{t('retried')}</span>}
          {run.retryable && runsTodaysJob(run, now) && (
            <span className="type-body-sm text-ink-faint">{t('retryToday')}</span>
          )}
          {run.retryable && (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<RotateCcw />}
              pending={retrying === run.id}
              onClick={() => onRetry(run)}
              className="relative z-[1] mt-1"
            >
              {t('retry')}
            </Button>
          )}
        </span>
      ),
    },
  ];
}
