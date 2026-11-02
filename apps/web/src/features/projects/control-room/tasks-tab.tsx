'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { EmptyState, SegmentedControl } from '@oneohm/design-system/web';
import { CircleCheck, Columns3, ListChecks, ListTree, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import type { ProjectSignals } from './room-signals';
import { TaskBoard } from './task-board';
import { TaskKanban } from './task-kanban';
import { inScope, TASK_SCOPES, type TaskScope } from './task-scope';
import { TaskTable } from './task-table';
import { useRoomTab } from './use-room-tab';

/**
 * Every task on the project, by stage (the board) or as one table (the list). Both
 * share the Open / Mine / All filter and the same task actions.
 */
export function TasksTab({
  project,
  signals,
}: {
  readonly project: ProjectDetail;
  readonly signals: ProjectSignals;
}) {
  const t = useTranslations('projects.board');
  const tabT = useTranslations('projects.tasksTab');
  const user = useCurrentUser();
  const { layout, setLayout } = useRoomTab();
  const [scope, setScope] = useState<TaskScope>('open');
  const shown = [...project.tasks]
    .filter((task) => inScope(task, scope, user.id))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));

  return (
    <section aria-label={tabT('label')} className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="type-body-sm text-ink-muted">
          {t('summary', { open: signals.open.length, total: signals.total })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label={t('view')}
            size="sm"
            value={scope}
            onValueChange={setScope}
            options={TASK_SCOPES.map((value) => ({ value, label: t(`views.${value}`) }))}
          />
          <SegmentedControl
            label={tabT('layout')}
            size="sm"
            value={layout}
            onValueChange={setLayout}
            options={[
              { value: 'board', label: tabT('board'), icon: <ListTree aria-hidden /> },
              { value: 'list', label: tabT('list'), icon: <Rows3 aria-hidden /> },
              { value: 'kanban', label: tabT('kanban'), icon: <Columns3 aria-hidden /> },
            ]}
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={scope === 'mine' ? <ListChecks /> : <CircleCheck />}
          title={t(`empty.${scope}`)}
        />
      ) : layout === 'list' ? (
        <TaskTable tasks={shown} />
      ) : layout === 'kanban' ? (
        <TaskKanban tasks={shown} />
      ) : (
        <TaskBoard project={project} scope={scope} />
      )}
    </section>
  );
}
