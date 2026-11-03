'use client';

import type { JobRunRecord } from '@oneohm/api-contracts';
import { ResponsiveTable, SegmentedControl, useToast } from '@oneohm/design-system/web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { RULE_KEYS } from '../rules/use-rule-settings';
import { useRunColumns } from './run-columns';
import { RunSheet } from './run-sheet';

type Show = 'all' | 'failed';

/**
 * The automatic jobs' recent runs (PRD 7.1 "workflow history and failure visibility"):
 * reminders, escalations, summaries, message delivery and payment checks, failures
 * first, with a retry for the ones that are safe to run again.
 */
export function AutomationPanel() {
  const t = useTranslations('settings.automation');
  const toast = useToast();
  const client = useQueryClient();
  const [show, setShow] = useState<Show>('all');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: RULE_KEYS.jobRuns,
    queryFn: () => expectStatus(api.businessSettings.jobRuns(), 200),
    refetchInterval: 30_000,
  });
  const retry = async (run: JobRunRecord) => {
    setRetrying(run.id);
    try {
      await expectStatus(
        api.businessSettings.retryJobRun({ params: { id: run.id }, body: {} }),
        202,
      );
      toast({ title: t('retryQueued'), reference: t(`jobs.${run.name}`), tone: 'success' });
      await client.invalidateQueries({ queryKey: RULE_KEYS.jobRuns });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    } finally {
      setRetrying(null);
    }
  };
  const columns = useRunColumns(retry, retrying, (run) => setOpenId(run.id));
  const runs = (query.data?.runs ?? []).filter((run) => show === 'all' || run.status === 'failed');
  const opened = query.data?.runs.find((run) => run.id === openId) ?? null;
  const failed = query.data?.failedLastWeek ?? 0;

  return (
    <section className="flex max-w-6xl flex-col gap-5">
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 className="type-display-md text-ink">{t('title')}</h2>
        <p className="type-body text-ink-muted">{t('intro')}</p>
      </div>
      {query.data && (
        <p
          className={`flex items-center gap-2 type-body ${failed > 0 ? 'text-overdue' : 'text-ink-muted'}`}
        >
          {failed > 0 ? (
            <CircleAlert aria-hidden className="size-4" />
          ) : (
            <CircleCheck aria-hidden className="size-4 text-on-track" />
          )}
          {failed > 0 ? t('failedWeek', { count: failed }) : t('allWell')}
        </p>
      )}
      <SegmentedControl<Show>
        label={t('show')}
        value={show}
        onValueChange={setShow}
        options={[
          { value: 'all', label: t('showAll') },
          { value: 'failed', label: t('showFailed') },
        ]}
        className="self-start"
      />
      {query.isPending && <ListSkeleton label={t('loading')} rows={6} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && runs.length === 0 && (
        <p className="py-6 type-body text-ink-muted">
          {show === 'failed' ? t('noFailures') : t('empty')}
        </p>
      )}
      {runs.length > 0 && (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={runs}
          rowKey={(run) => run.id}
        />
      )}
      <p className="max-w-2xl type-body-sm text-ink-faint">{t('kept')}</p>
      <RunSheet
        run={opened}
        retrying={retrying === opened?.id}
        onRetry={retry}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}
