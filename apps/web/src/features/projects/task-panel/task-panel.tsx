'use client';

import { EmptyState, Sheet } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { TaskPanelBody } from './task-panel-body';
import { panelShown, panelView } from './task-panel-url';
import { taskKey, useTaskPanel } from './use-task-panel';

/** One task panel for the whole app, opened by `?task=<id>` from any task list. */
export function TaskPanel() {
  const { taskId, close } = useTaskPanel();
  const [lastShown, setLastShown] = useState<string | null>(null);
  const shown = panelShown(lastShown, taskId);
  useEffect(() => {
    if (taskId) setLastShown(taskId);
  }, [taskId]);
  if (!shown.id) return null;
  return (
    <OpenTaskPanel
      key={shown.id}
      taskId={shown.id}
      open={shown.open}
      onClose={close}
      onClosed={() => setLastShown(null)}
    />
  );
}

function OpenTaskPanel({
  taskId,
  open,
  onClose,
  onClosed,
}: {
  readonly taskId: string;
  readonly open: boolean;
  readonly onClose: () => void;
  /** After the closing slide, so the panel leaves the page. */
  readonly onClosed: () => void;
}) {
  const t = useTranslations('projects.panel');
  const query = useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => expectStatus(api.tasks.getTask({ params: { id: taskId } }), 200),
    retry: (count, error) => !isMissing(error) && count < 2,
  });
  const task = query.data;
  const view = panelView({
    data: task,
    isPending: query.isPending,
    isError: query.isError,
    missing: isMissing(query.error),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      onExitComplete={onClosed}
      width="lg"
      title={task?.title ?? t('title')}
      {...(task ? { description: `${task.projectCode} · ${task.projectName}` } : {})}
    >
      {view === 'body' && task ? (
        <TaskPanelBody task={task} />
      ) : view === 'missing' ? (
        <EmptyState icon={<SearchX />} title={t('notFound')} description={t('notFoundBody')} />
      ) : view === 'error' ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <ListSkeleton label={t('loading')} rows={4} />
      )}
    </Sheet>
  );
}

/** Not there, or not this person's to see: both read as "not found". */
function isMissing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}
