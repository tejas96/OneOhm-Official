'use client';

import { cn } from '@oneohm/design-system/web';
import type { TaskPriority } from '@oneohm/domain';
import { useTranslations } from 'next-intl';

const BARS: Readonly<Record<Exclude<TaskPriority, 'none' | 'urgent'>, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * A task's priority as a small mark, Linear style: a filled square for Urgent, three,
 * two or one bars for High, Medium and Low. Nothing shows for no priority unless
 * `showNone` (for the control that sets it).
 */
export function PriorityIcon({
  priority: given,
  showNone = false,
  className,
}: {
  readonly priority: TaskPriority;
  readonly showNone?: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('projects.priority');
  // An older API sends no priority yet; read it as none.
  const priority: TaskPriority = given ?? 'none';
  if (priority === 'none' && !showNone) return null;
  const label = t(priority);
  if (priority === 'urgent')
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-overdue font-bold text-[0.625rem] text-white leading-none',
          className,
        )}
      >
        !
      </span>
    );
  const filled = priority === 'none' ? 0 : BARS[priority];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-end gap-[2px] px-[1px] pb-[2px]',
        className,
      )}
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            'w-[3px] rounded-[1px]',
            bar === 1 ? 'h-[5px]' : bar === 2 ? 'h-[8px]' : 'h-[11px]',
            bar <= filled ? 'bg-ink-muted' : 'bg-rule',
          )}
        />
      ))}
    </span>
  );
}
