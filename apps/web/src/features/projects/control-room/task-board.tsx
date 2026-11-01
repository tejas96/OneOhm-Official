'use client';

import type { ProjectDetail, ProjectTask } from '@oneohm/api-contracts';
import { cn, EmptyState, SegmentedControl } from '@oneohm/design-system/web';
import { EPC_STAGES } from '@oneohm/domain';
import { CircleCheck, ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { TaskCard } from '../tasks/task-card';

const VIEWS = ['open', 'mine', 'all'] as const;
type View = (typeof VIEWS)[number];

function visible(task: ProjectTask, view: View, userId: string): boolean {
  if (view === 'all') return true;
  if (task.status === 'completed') return false;
  return view === 'open' || task.assignee?.id === userId;
}

/** Every task, stage by stage, with its one next step; finished work folds away. */
export function TaskBoard({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.board');
  const stagesT = useTranslations('stages');
  const user = useCurrentUser();
  const [view, setView] = useState<View>('open');
  const open = project.tasks.filter((task) => task.status !== 'completed').length;
  const stages = EPC_STAGES.map((stage) => {
    const all = project.tasks.filter((task) => task.stage === stage);
    return {
      stage,
      all,
      done: all.filter((task) => task.status === 'completed').length,
      shown: all.filter((task) => visible(task, view, user.id)),
    };
  }).filter((group) => group.all.length > 0);
  const nothingShown = stages.every((group) => group.shown.length === 0);

  return (
    <section aria-labelledby="task-board-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="task-board-title" className="type-display-md text-ink">
            {t('title')}
          </h2>
          <p className="type-body-sm text-ink-muted">
            {t('summary', { open, total: project.tasks.length })}
          </p>
        </div>
        <SegmentedControl
          label={t('view')}
          size="sm"
          value={view}
          onValueChange={setView}
          options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))}
        />
      </div>
      {nothingShown ? (
        <EmptyState
          icon={view === 'mine' ? <ListChecks /> : <CircleCheck />}
          title={t(`empty.${view}`)}
        />
      ) : (
        <ol className="flex flex-col gap-8">
          {stages.map((group) => (
            <li key={group.stage} className="flex flex-col">
              <div className="flex items-center gap-3 border-b border-hairline pb-2.5">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    group.done === group.all.length
                      ? 'bg-on-track'
                      : group.stage === project.currentStage
                        ? 'bg-accent'
                        : 'bg-rule',
                  )}
                />
                <h3 className="type-title-md text-ink">{stagesT(group.stage)}</h3>
                <span className="font-mono text-[0.75rem] text-ink-faint">
                  {group.done}/{group.all.length}
                </span>
              </div>
              {group.shown.length === 0 ? (
                <p className="py-3 type-body-sm text-ink-faint">{t('stageDone')}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {group.shown.map((task, index) => (
                    <TaskCard key={task.id} task={task} index={index} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
