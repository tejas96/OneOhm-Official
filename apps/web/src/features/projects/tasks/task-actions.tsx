'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, IconButton, Popover } from '@oneohm/design-system/web';
import {
  CircleCheck,
  Ellipsis,
  Hourglass,
  type LucideIcon,
  Play,
  ShieldCheck,
  UserRoundPen,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { AssignDialog } from './assign-dialog';
import { CompleteTaskDialog } from './complete-task-dialog';
import { isBlocked } from './task-status';
import { useTaskActions } from './use-task-actions';
import { WaitingDialog } from './waiting-dialog';

type DialogName = 'complete' | 'waiting' | 'assign';

interface MenuEntry {
  readonly key: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
}

/**
 * The one next step for a task as a button, the rest in a small menu. Only what the
 * person may do is offered: the assignee or a manager works the task, `tasks.assign`
 * hands it over and `tasks.approve` signs off reviews.
 */
export function TaskActions({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.task.actions');
  const user = useCurrentUser();
  const manager = useCan('tasks.assign', 'projects.manage');
  const canAssign = useCan('tasks.assign');
  const canApprove = useCan('tasks.approve');
  const actions = useTaskActions(task);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [session, setSession] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const open = (name: DialogName) => {
    setMenuOpen(false);
    setSession((value) => value + 1);
    setDialog(name);
  };

  if (task.status === 'completed') return null;
  const canWork = task.assignee?.id === user.id || manager;
  const blocked = isBlocked(task);
  const openWork = task.status !== 'in_review';

  let primary: { label: string; icon: LucideIcon; run: () => void; pending: boolean } | null = null;
  if (task.status === 'in_review' && canApprove) {
    primary = {
      label: t('approve'),
      icon: ShieldCheck,
      run: () => actions.approve.mutate(),
      pending: actions.approve.isPending,
    };
  } else if (canWork && !blocked && (task.status === 'pending' || task.status === 'ready')) {
    primary = {
      label: t('start'),
      icon: Play,
      run: () => actions.start.mutate(),
      pending: actions.start.isPending,
    };
  } else if (canWork && !blocked && openWork) {
    primary = {
      label: t('complete'),
      icon: CircleCheck,
      run: () => open('complete'),
      pending: false,
    };
  }

  const menu: MenuEntry[] = [];
  if (canWork && !blocked && openWork && primary?.label !== t('complete'))
    menu.push({ key: 'complete', icon: CircleCheck, onSelect: () => open('complete') });
  if (canWork && !blocked && task.status === 'waiting')
    menu.push({
      key: 'resume',
      icon: Play,
      onSelect: () => {
        setMenuOpen(false);
        actions.start.mutate();
      },
    });
  if (canWork && openWork && task.status !== 'waiting')
    menu.push({ key: 'waiting', icon: Hourglass, onSelect: () => open('waiting') });
  if (canAssign) menu.push({ key: 'assign', icon: UserRoundPen, onSelect: () => open('assign') });

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {primary && (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<primary.icon />}
          pending={primary.pending}
          onClick={primary.run}
        >
          {primary.label}
        </Button>
      )}
      {menu.length > 0 && (
        <Popover
          label={t('more')}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          align="end"
          className="p-1"
          trigger={
            <IconButton label={t('more')} size="sm" variant="quiet">
              <Ellipsis aria-hidden />
            </IconButton>
          }
        >
          <ul className="flex min-w-48 flex-col">
            {menu.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={entry.onSelect}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left type-body-sm text-ink hover:bg-sunken"
                >
                  <entry.icon aria-hidden className="size-4 text-ink-faint" />
                  {t(entry.key)}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
      <CompleteTaskDialog
        key={`complete-${session}`}
        task={task}
        open={dialog === 'complete'}
        onOpenChange={(next) => setDialog(next ? 'complete' : null)}
        mutation={actions.complete}
      />
      <WaitingDialog
        key={`waiting-${session}`}
        task={task}
        open={dialog === 'waiting'}
        onOpenChange={(next) => setDialog(next ? 'waiting' : null)}
        mutation={actions.waiting}
      />
      <AssignDialog
        task={task}
        open={dialog === 'assign'}
        onOpenChange={(next) => setDialog(next ? 'assign' : null)}
        mutation={actions.assign}
      />
    </div>
  );
}
