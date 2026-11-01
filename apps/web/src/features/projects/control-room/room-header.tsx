'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { cn, StageTracker, StatusPill } from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { ProjectChangeRequestButton } from '@/features/discom/project-change-request-button';
import { RoomAlerts } from './room-alerts';
import { RoomFacts } from './room-facts';
import type { ProjectSignals } from './room-signals';
import { projectSwatch, stagesOf } from './room-stages';

/**
 * The room's title block: who the project is for and how it stands, the facts people ask
 * about most, the journey through the seven stages and anything that threatens the dates.
 */
export function RoomHeader({
  project,
  signals,
}: {
  readonly project: ProjectDetail;
  readonly signals: ProjectSignals;
}) {
  const t = useTranslations('projects.room');
  const typeT = useTranslations('projects.list.type');
  const statusT = useTranslations('projects.room.projectStatus');
  const stagesT = useTranslations('stages');
  const format = useFormatter();
  const stages = stagesOf(project, stagesT);

  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-sm text-ink-muted">
            <span
              aria-hidden
              className={cn('size-2.5 rounded-[3px]', projectSwatch(project.code))}
            />
            <span className="font-mono text-[0.75rem] text-ink-faint">{project.code}</span>
            {typeT(project.type)}
            <span className="font-mono text-[0.75rem] text-ink-faint">
              {formatKwp(project.capacityWp)}
            </span>
            {project.status !== 'active' && (
              <span className="text-ink-faint">{statusT(project.status)}</span>
            )}
          </p>
          <h1 className="type-display-md text-balance text-ink md:type-display-lg">
            {project.name}
          </h1>
          {project.next && (
            <p className="type-body-sm text-ink-muted">
              {t('next', { label: project.next.label })} ·{' '}
              <time dateTime={project.next.date} className="text-ink">
                {format.dateTime(new Date(project.next.date), { day: 'numeric', month: 'short' })}
              </time>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <StatusPill tone={project.tone} label={project.toneLabel} />
          <ProjectChangeRequestButton projectId={project.id} />
        </div>
      </div>
      <RoomFacts project={project} />
      <StageTracker stages={stages} variant="full" className="hidden md:flex" />
      <StageTracker stages={stages} className="md:hidden" />
      <RoomAlerts project={project} signals={signals} />
    </header>
  );
}
