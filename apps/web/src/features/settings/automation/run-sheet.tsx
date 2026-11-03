'use client';

import type { JobRunRecord } from '@oneohm/api-contracts';
import { Button, Sheet, StatusPill } from '@oneohm/design-system/web';
import { RotateCcw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { RUN_TONE } from './run-columns';
import { minutesAndSeconds, took } from './run-format';

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <h3 className="type-label font-medium text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-baseline gap-x-4">
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words type-body text-ink">{children}</dd>
    </div>
  );
}

/** Everything recorded about one automatic run, in a drawer. */
export function RunSheet({
  run,
  retrying,
  onRetry,
  onClose,
}: {
  readonly run: JobRunRecord | null;
  readonly retrying: boolean;
  readonly onRetry: (run: JobRunRecord) => void;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.automation');
  const format = useFormatter();
  const when = (at: string | null) =>
    at ? format.dateTime(new Date(at), { dateStyle: 'medium', timeStyle: 'medium' }) : '—';
  const duration = (item: JobRunRecord) => {
    const ms = took(item);
    if (ms === null) return '—';
    if (ms < 1000) return t('sheet.underSecond');
    const { minutes, seconds } = minutesAndSeconds(ms);
    return minutes > 0 ? t('sheet.minutes', { minutes, seconds }) : t('sheet.seconds', { seconds });
  };
  return (
    <Sheet
      open={run !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={run ? t(`jobs.${run.name}`) : ''}
      description={run ? t(`triggers.${run.trigger}`) : undefined}
      header={
        run ? (
          <div className="flex">
            <StatusPill size="sm" tone={RUN_TONE[run.status]} label={t(`status.${run.status}`)} />
          </div>
        ) : undefined
      }
    >
      {run && (
        <div className="flex flex-col gap-5 px-6 py-5">
          <Section title={t('sheet.outcome')}>
            <dl className="flex flex-col gap-2">
              <Row label={t('columns.result')}>
                {run.status === 'succeeded' && run.result !== null
                  ? t(`results.${run.name}`, { count: Number(run.result) || 0 })
                  : t(`status.${run.status}`)}
              </Row>
              {run.retried && <Row label={t('sheet.retry')}>{t('retried')}</Row>}
              {run.requestedBy && <Row label={t('sheet.requestedBy')}>{run.requestedBy.name}</Row>}
            </dl>
            {run.retryable && (
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<RotateCcw />}
                pending={retrying}
                onClick={() => onRetry(run)}
                className="self-start"
              >
                {t('retry')}
              </Button>
            )}
          </Section>
          {run.error && (
            <Section title={t('sheet.error')}>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-sunken p-3 font-mono text-[0.75rem] text-overdue">
                {run.error}
              </pre>
            </Section>
          )}
          <Section title={t('sheet.timing')}>
            <dl className="flex flex-col gap-2">
              <Row label={t('sheet.queued')}>{when(run.createdAt)}</Row>
              <Row label={t('sheet.started')}>{when(run.startedAt)}</Row>
              <Row label={t('sheet.finished')}>{when(run.finishedAt)}</Row>
              <Row label={t('sheet.duration')}>{duration(run)}</Row>
            </dl>
          </Section>
          <Section title={t('sheet.technical')}>
            <dl className="flex flex-col gap-2">
              <Row label={t('sheet.jobCode')}>
                <span className="font-mono text-[0.8125rem]">{run.name}</span>
              </Row>
              {run.retryOfId && (
                <Row label={t('sheet.retryOf')}>
                  <span className="select-all font-mono text-[0.8125rem]">{run.retryOfId}</span>
                </Row>
              )}
              {run.subjectId && (
                <Row label={t('sheet.subjectId')}>
                  <span className="select-all font-mono text-[0.8125rem]">{run.subjectId}</span>
                </Row>
              )}
              <Row label={t('sheet.runId')}>
                <span className="select-all font-mono text-[0.8125rem]">{run.id}</span>
              </Row>
            </dl>
          </Section>
        </div>
      )}
    </Sheet>
  );
}
