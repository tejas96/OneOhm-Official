'use client';

import { pageEnter, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { DocumentsPanel } from '@/features/documents/documents-panel';
import { ProjectMaterialCard } from '@/features/inventory/material/project-material-card';
import { api, expectStatus } from '@/lib/api/api-client';
import { ActivityTimeline } from './activity-timeline';
import { PaymentPanel } from './payment-panel';
import { ReportReadiness } from './report-readiness';
import { RoomHeader } from './room-header';
import { TaskBoard } from './task-board';

export const projectQueryKey = (id: string) => ['project', id] as const;

/**
 * The project control room: the journey and key facts on top, every task by stage on
 * the left, and money, statutory reports and the activity trail on the right.
 */
export function ControlRoomView({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('projects.room');
  const query = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => expectStatus(api.projects.getProject({ params: { id: projectId } }), 200),
  });

  if (query.isPending) {
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Skeleton className="h-[32rem] rounded-2xl" />
          <Skeleton className="h-[32rem] rounded-2xl" />
        </div>
      </SkeletonGroup>
    );
  }
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;

  const project = query.data;
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-10 py-2">
      <RoomHeader project={project} />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <TaskBoard project={project} />
        <aside className="flex flex-col gap-6">
          <PaymentPanel project={project} />
          <ProjectMaterialCard projectId={project.id} />
          <ReportReadiness projectId={project.id} reports={project.reports} />
          <DocumentsPanel scope={{ projectId: project.id }} />
          <ActivityTimeline activities={project.activities} />
        </aside>
      </div>
    </motion.div>
  );
}
