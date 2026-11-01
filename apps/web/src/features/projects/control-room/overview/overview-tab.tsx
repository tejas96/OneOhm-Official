'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { InstalledSystemCard } from '@/features/after-sales/installed-system-card';
import { ChangeRequestNotice } from '@/features/discom/change-request-notice';
import { ProjectChangesCard } from '@/features/project-changes/project-changes-card';
import { ConfirmAssigneesCard } from '@/features/projects/team/confirm-assignees-card';
import type { ProjectSignals } from '../room-signals';
import { useRoomTab } from '../use-room-tab';
import { AboutPanel } from './about-panel';
import { BudgetPanel } from './budget-panel';
import { NextUp } from './next-up';
import { OverviewKpis } from './overview-kpis';
import { PaymentsSummary } from './payments-summary';
import { ReportsSummary } from './reports-summary';
import { RisksPanel } from './risks-panel';
import { StageRatingsCard } from './stage-ratings-card';
import { TeamPanel } from './team-panel';

/**
 * The project at a glance: four numbers, what comes next, what could slip, and short
 * money and paperwork summaries that each open their own tab.
 */
export function OverviewTab({
  project,
  signals,
}: {
  readonly project: ProjectDetail;
  readonly signals: ProjectSignals;
}) {
  const { hrefFor } = useRoomTab();
  return (
    <div className="flex flex-col gap-6">
      <OverviewKpis signals={signals} projectId={project.id} />
      {/* Risks come straight after the numbers on phones; on wide screens they head the side column. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ChangeRequestNotice scope={{ projectId: project.id }} />
          <ProjectChangesCard projectId={project.id} />
          <ConfirmAssigneesCard project={project} />
          <NextUp signals={signals} tasksHref={hrefFor('tasks')} />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <PaymentsSummary project={project} href={hrefFor('payments')} />
            <ReportsSummary reports={project.reports} href={hrefFor('reports')} />
          </div>
          <InstalledSystemCard project={project} />
        </div>
        <div className="order-first min-w-0 lg:order-none lg:col-start-2 lg:row-start-1">
          <RisksPanel signals={signals} />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-2">
          <BudgetPanel project={project} />
          <TeamPanel project={project} />
          <StageRatingsCard projectId={project.id} />
          <AboutPanel project={project} />
        </div>
      </div>
    </div>
  );
}
