'use client';

import type { ProjectSummary } from '@oneohm/api-contracts';
import { Avatar, cn, listItemEnter, StageTracker, StatusPill } from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { projectSwatch } from './control-room/room-stages';
import { attentionReason, stagesFromSummary } from './project-presentation';

/** A project at a glance: who and where, status with its reason, stage, next step and load. */
export function ProjectCard({
  project,
  index,
}: {
  readonly project: ProjectSummary;
  readonly index: number;
}) {
  const t = useTranslations('projects.list');
  const typeT = useTranslations('projects.list.type');
  const statusT = useTranslations('projects.room.projectStatus');
  const partyT = useTranslations('commandCenter.party');
  const stagesT = useTranslations('stages');
  const format = useFormatter();
  const reason = attentionReason(project);

  return (
    <motion.li
      {...listItemEnter(index)}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-hairline bg-raised transition-[box-shadow,border-color] duration-(--duration-base) hover:border-rule hover:shadow-e2"
    >
      <span aria-hidden className={cn('h-1 w-full', projectSwatch(project.code))} />
      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-baseline gap-x-2 type-body-sm text-ink-faint">
              <span className="font-mono text-[0.75rem]">{project.code}</span>
              {typeT(project.type)}
            </span>
            <h2 className="type-title-lg text-ink">
              <Link
                href={`/projects/${project.id}`}
                className="oh-stretched-link rounded-sm hover:text-accent"
              >
                {project.name}
              </Link>
            </h2>
            <p className="truncate type-body-sm text-ink-muted">
              {project.place} · {project.discom} · {formatKwp(project.capacityWp)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusPill tone={project.tone} label={project.toneLabel} size="sm" />
            {project.status !== 'active' && (
              <span className="type-body-sm text-ink-faint">{statusT(project.status)}</span>
            )}
          </div>
        </div>
        {reason && (
          <p className="-mt-2 type-body-sm text-ink-muted">
            {reason.key === 'overdue'
              ? t('card.overdue', { count: reason.count })
              : t('card.waiting', {
                  party: partyT(project.waitingOn ?? 'internal'),
                  days: reason.count,
                })}
          </p>
        )}
        <StageTracker stages={stagesFromSummary(project, stagesT)} />
        <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-t border-hairline pt-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="type-body-sm text-ink-faint">{t('card.next')}</span>
            <span className="truncate type-body-sm text-ink">
              {project.next?.label ?? t('card.nothingNext')}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="type-body-sm text-ink-faint">{t('card.due')}</span>
            {project.next ? (
              <time dateTime={project.next.date} className="type-body-sm text-ink">
                {format.dateTime(new Date(project.next.date), { day: 'numeric', month: 'short' })}
              </time>
            ) : (
              <span className="type-body-sm text-ink-faint">{t('card.noDate')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 type-body-sm">
          <span className="flex min-w-0 items-center gap-2 text-ink-muted">
            {project.manager ? (
              <>
                <Avatar name={project.manager.fullName} swatch={1} size="sm" />
                <span className="truncate">{project.manager.fullName}</span>
              </>
            ) : (
              <span className="text-ink-faint">{t('card.noManager')}</span>
            )}
          </span>
          <span className="shrink-0 text-ink-faint tabular-nums">
            {t('card.tasksDone', { done: project.tasksDone, total: project.tasksTotal })}
            {project.overdueTasks > 0 && (
              <span className="text-overdue">
                {' · '}
                {t('card.overdueTasks', { count: project.overdueTasks })}
              </span>
            )}
          </span>
        </div>
      </div>
    </motion.li>
  );
}
