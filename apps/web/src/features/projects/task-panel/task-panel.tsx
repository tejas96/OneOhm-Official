'use client';

import { EmptyState, Sheet } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { TaskPanelBody } from './task-panel-body';
import { taskKey, useTaskPanel } from './use-task-panel';

/** One task panel for the whole app, opened by `?task=<id>` from any task list. */
export function TaskPanel() {
  const { taskId, close } = useTaskPanel();
  if (!taskId) return null;
  return <OpenTaskPanel key={taskId} taskId={taskId} onClose={close} />;
}

function OpenTaskPanel({
  taskId,
  onClose,
}: {
  readonly taskId: string;
  readonly onClose: () => void;
}) {
  const t = useTranslations('projects.panel');
  const query = useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => expectStatus(api.tasks.getTask({ params: { id: taskId } }), 200),
    retry: (count, error) => !isMissing(error) && count < 2,
  });
  const task = query.data;

  return (
    <Sheet
      open
      onOpenChange={(next) => !next && onClose()}
      width="lg"
      title={task?.title ?? t('title')}
      {...(task ? { description: `${task.projectCode} · ${task.projectName}` } : {})}
    >
      {query.isPending ? (
        <ListSkeleton label={t('loading')} rows={4} />
      ) : query.isError ? (
        isMissing(query.error) ? (
          <EmptyState icon={<SearchX />} title={t('notFound')} description={t('notFoundBody')} />
        ) : (
          <LoadError error={query.error} onRetry={() => query.refetch()} />
        )
      ) : task ? (
        <TaskPanelBody task={task} />
      ) : null}
    </Sheet>
  );
}

/** Not there, or not this person's to see: both read as "not found". */
function isMissing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}
