'use client';

import { cn } from '@oneohm/design-system/web';
import type { ReactNode } from 'react';
import { useTaskPanel } from './use-task-panel';

/**
 * A task's title that opens its panel. Only the title is the button, so the actions
 * and menus beside it keep working as before.
 */
export function TaskTitleButton({
  taskId,
  className,
  children,
}: {
  readonly taskId: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { open } = useTaskPanel();
  return (
    <button
      type="button"
      onClick={() => open(taskId)}
      className={cn(
        'cursor-pointer text-left underline-offset-2 hover:text-accent hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-focus',
        className,
      )}
    >
      {children}
    </button>
  );
}
