'use client';

import { pageEnter, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { ActionList } from './action-list';
import { MoneyLedger } from './money-ledger';
import { MorningBrief } from './morning-brief';
import { CollectionsTile, HealthTile, InstalledTile, WaitingTile } from './overview-tiles';
import { PipelineTile } from './pipeline-tile';
import { ProjectLedger } from './project-ledger';

/**
 * The owner's morning view: a one-paragraph brief, then the tiles (what was built,
 * money in, what needs the owner, health, waiting time, sales), then every live
 * project as a metro line, then the money ledger. Refreshes every minute.
 */
export function CommandCenterView() {
  const t = useTranslations('commandCenter');
  const query = useQuery({
    queryKey: ['command-center'],
    queryFn: () => expectStatus(api.projects.commandCenter(), 200),
    refetchInterval: 60_000,
  });

  if (query.isPending) {
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 py-2"
      >
        <Skeleton className="h-28 w-2/3 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-[26rem] rounded-[28px] lg:col-span-7" />
          <Skeleton className="h-[26rem] rounded-[28px] lg:col-span-5" />
        </div>
      </SkeletonGroup>
    );
  }
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;

  const data = query.data;
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-12 py-2">
      <MorningBrief data={data} />
      <div className="grid gap-4 lg:grid-cols-12">
        <InstalledTile installed={data.installed} className="lg:col-span-7 lg:row-span-2" />
        <CollectionsTile collections={data.collections} className="lg:col-span-5" />
        <ActionList
          actions={data.actions}
          compact
          limit={3}
          className="rounded-[28px] border-0 shadow-e1 ring-1 ring-hairline/70 lg:col-span-5"
        />
        <HealthTile health={data.health} className="lg:col-span-4" />
        <WaitingTile days={data.waitingDays} className="lg:col-span-4" />
        <PipelineTile pipeline={data.pipeline} className="lg:col-span-4" />
      </div>
      <ProjectLedger projects={data.projects} total={data.liveProjects} />
      <MoneyLedger money={data.money} />
    </motion.div>
  );
}
