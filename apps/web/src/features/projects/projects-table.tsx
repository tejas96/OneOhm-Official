'use client';

import type { ProjectSummary } from '@oneohm/api-contracts';
import { cn, ResponsiveTable, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { EPC_STAGES } from '@oneohm/domain';
import { formatKwp } from '@oneohm/shared';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { projectSwatch } from './control-room/room-stages';

/** Every project as one row: who, where, how big, how far, how it stands and what is next. */
export function ProjectsTable({ projects }: { readonly projects: readonly ProjectSummary[] }) {
  const t = useTranslations('projects.list');
  const typeT = useTranslations('projects.list.type');
  const stagesT = useTranslations('stages');
  const format = useFormatter();

  const columns: TableColumn<ProjectSummary>[] = [
    {
      key: 'project',
      header: t('columns.project'),
      primary: true,
      className: 'min-w-56',
      cell: (project) => (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={cn('h-8 w-1 shrink-0 rounded-full', projectSwatch(project.code))}
          />
          <span className="flex min-w-0 flex-col">
            <Link
              href={`/projects/${project.id}`}
              className="oh-stretched-link truncate rounded-sm font-medium text-ink hover:text-accent"
            >
              {project.name}
            </Link>
            <span className="font-mono text-[0.75rem] font-normal whitespace-nowrap text-ink-faint">
              {project.code} · {typeT(project.type)}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'place',
      header: t('columns.place'),
      cell: (project) => (
        <span className="flex flex-col">
          <span className="text-ink-muted">{project.place}</span>
          <span className="type-label whitespace-nowrap text-ink-faint">
            {project.discom} · {formatKwp(project.capacityWp)}
          </span>
        </span>
      ),
    },
    {
      key: 'manager',
      header: t('columns.manager'),
      hideOnPhone: true,
      cell: (project) =>
        project.manager ? (
          <span className="whitespace-nowrap text-ink-muted">{project.manager.fullName}</span>
        ) : (
          <span className="text-ink-faint">{t('card.noManager')}</span>
        ),
    },
    {
      key: 'stage',
      header: t('columns.stage'),
      cell: (project) => (
        <span className="whitespace-nowrap text-ink-muted">
          {stagesT(project.currentStage)}
          <span className="font-mono text-[0.75rem] text-ink-faint tabular-nums">
            {' '}
            {EPC_STAGES.indexOf(project.currentStage) + 1}/{EPC_STAGES.length}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (project) => <StatusPill tone={project.tone} label={project.toneLabel} size="sm" />,
    },
    {
      key: 'next',
      header: t('columns.next'),
      className: 'min-w-48',
      cell: (project) => (
        <span className="line-clamp-2 type-body-sm text-ink-muted">
          {project.next?.label ?? t('card.nothingNext')}
        </span>
      ),
    },
    {
      key: 'due',
      header: t('columns.due'),
      cell: (project) =>
        project.next ? (
          <time
            dateTime={project.next.date}
            className="font-mono text-[0.8125rem] whitespace-nowrap text-ink tabular-nums"
          >
            {format.dateTime(new Date(project.next.date), { day: 'numeric', month: 'short' })}
          </time>
        ) : (
          <span className="text-ink-faint">{t('card.noDate')}</span>
        ),
    },
    {
      key: 'tasks',
      header: t('columns.tasks'),
      align: 'end',
      hideOnPhone: true,
      cell: (project) => (
        <span className="flex flex-col items-end whitespace-nowrap type-body-sm tabular-nums">
          <span className="text-ink-muted">
            {t('card.tasksDoneShort', { done: project.tasksDone, total: project.tasksTotal })}
          </span>
          {project.overdueTasks > 0 && (
            <span className="text-overdue">
              {t('card.overdueTasks', { count: project.overdueTasks })}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <ResponsiveTable
      caption={t('title')}
      columns={columns}
      rows={projects}
      rowKey={(project) => project.id}
      className="relative overflow-x-auto"
    />
  );
}
