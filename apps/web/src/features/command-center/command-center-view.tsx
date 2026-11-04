'use client';

import { Button, PageHeader, pageEnter, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { BlockedPage, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { ActionList } from './action-list';
import { CenterFilterBar } from './center-filter-bar';
import { CenterKpis } from './center-kpis';
import { DeadlinesAhead, DecisionsWaiting } from './center-panels';
import { HealthCard } from './health-card';
import { MaterialRiskCard } from './material-risks';
import { MoneyLedger } from './money-ledger';
import { OutlookTile } from './outlook-tile';
import { PipelineTile } from './pipeline-tile';
import { ProjectLedger } from './project-ledger';
import { ProjectStates } from './project-states';
import { RiskCards } from './risk-cards';
import { TeamLoadSection } from './team-load';
import { useCenterFilters } from './use-center-filters';
import { WaitingTile } from './waiting-tile';

const COLUMNS = 'grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]';

/**
 * The owner's command centre in Lintel's reading order: the health score and what needs
 * the owner, the live numbers, then what could slip (with the next action) beside the
 * decisions and deadlines waiting, then every live project and the money. Every figure
 * opens its records. Refreshes every minute.
 */
export function CommandCenterView() {
  const t = useTranslations('commandCenter');
  if (!useCan('dashboard.view_business')) return <BlockedPage title={t('title')} />;
  return <CommandCenterContent />;
}

function CommandCenterContent() {
  const t = useTranslations('commandCenter');
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const canQuote = useCan('quotations.create');
  const { query } = useCenterFilters();
  const center = useQuery({
    queryKey: ['command-center', query],
    queryFn: () => expectStatus(api.projects.commandCenter({ query }), 200),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const data = center.data;
  const short = (date: string) =>
    format.dateTime(new Date(date), { day: 'numeric', month: 'short' });
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 py-2">
      <PageHeader
        title={t('title')}
        description={
          data
            ? t('description', {
                scope: t(data.narrowed ? 'scope.narrowed' : 'scope.all'),
                start: short(data.range.start),
                end: short(data.range.end),
                updated: format.relativeTime(new Date(data.generatedAt), now),
              })
            : undefined
        }
        actions={
          canQuote && (
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/quotations/new">{t('newQuotation')}</Link>
            </Button>
          )
        }
      />
      <CenterFilterBar />
      {center.isPending && (
        <SkeletonGroup
          label={t('loading')}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map((tile) => (
            <Skeleton key={tile} className="h-24 rounded-xl" />
          ))}
        </SkeletonGroup>
      )}
      {center.isError && !data && (
        <LoadError error={center.error} onRetry={() => center.refetch()} />
      )}
      {data && (
        <div
          aria-busy={center.isPlaceholderData}
          className={`flex flex-col gap-8 transition-opacity ${center.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          <div className={COLUMNS}>
            <HealthCard data={data} query={query} />
            <ActionList actions={data.actions} compact limit={4} />
          </div>
          <CenterKpis data={data} query={query} />
          <ProjectStates data={data} query={query} />
          <div className={COLUMNS}>
            <div className="flex min-w-0 flex-col gap-6">
              <RiskCards risks={data.risks} />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <WaitingTile days={data.waitingDays} query={query} />
                <PipelineTile pipeline={data.pipeline} query={query} />
              </div>
              <MaterialRiskCard materials={data.materials} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <DecisionsWaiting decisions={data.decisions} />
              <OutlookTile outlook={data.outlook} query={query} />
              <DeadlinesAhead
                deadlines={data.deadlines}
                today={todayIn()}
                days={data.dueSoonDays}
              />
            </div>
          </div>
          <ProjectLedger projects={data.projects} total={data.liveProjects} query={query} />
          <MoneyLedger money={data.money} dueSoonDays={data.dueSoonDays} />
          <TeamLoadSection query={query} />
        </div>
      )}
    </motion.div>
  );
}
