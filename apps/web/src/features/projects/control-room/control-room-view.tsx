'use client';

import { pageEnter, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { RoomHeader } from './room-header';
import { projectSignals } from './room-signals';
import { RoomTabs } from './room-tabs';

export const projectQueryKey = (id: string) => ['project', id] as const;

function RoomSkeleton({ label }: { readonly label: string }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-5">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-11 w-2/3" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-11 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <Skeleton key={tile} className="h-32 rounded-xl" />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/**
 * The project room: a title block with the key facts, the stage bar and any alerts on
 * top, then one tab at a time (overview, tasks, payments, material, documents, reports,
 * activity) instead of everything on one long page.
 */
export function ControlRoomView({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('projects.room');
  const query = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => expectStatus(api.projects.getProject({ params: { id: projectId } }), 200),
  });
  const signals = useMemo(() => (query.data ? projectSignals(query.data) : null), [query.data]);

  return (
    <div className="mx-auto flex w-full max-w-[90rem] min-w-0 flex-col gap-6 py-2">
      <Link
        href="/projects"
        className="inline-flex min-h-11 items-center gap-1 self-start rounded-sm type-body-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      {query.isPending && <RoomSkeleton label={t('loading')} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && signals && (
        <>
          <motion.div {...pageEnter}>
            <RoomHeader project={query.data} signals={signals} />
          </motion.div>
          <RoomTabs project={query.data} signals={signals} />
        </>
      )}
    </div>
  );
}
