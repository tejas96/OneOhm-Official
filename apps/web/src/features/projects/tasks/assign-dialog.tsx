'use client';

import type { Person, ProjectTask } from '@oneohm/api-contracts';
import { Avatar, Badge, Checkbox, cn, Dialog } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleAlert, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton } from '@/components/query-state';
import { OverloadBadge } from '@/features/team/capacity/overload-badge';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

interface AssignMutation {
  readonly isPending: boolean;
  readonly variables?: string | null | undefined;
  readonly mutateAsync: (userId: string | null) => Promise<unknown>;
}

const byLoad = (left: Person, right: Person) =>
  Number(left.onLeave) - Number(right.onLeave) || left.openTasks - right.openTasks;

/** Hands a task to someone in its role (least busy first), or to anyone when needed. */
export function AssignDialog({
  task,
  open,
  onOpenChange,
  mutation,
}: {
  readonly task: ProjectTask;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mutation: AssignMutation;
}) {
  const t = useTranslations('projects.assign');
  const [everyone, setEveryone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const people = useQuery({
    queryKey: ['people'],
    queryFn: () => expectStatus(api.people.listPeople(), 200),
    enabled: open,
  });
  const active = (people.data ?? []).filter((person) => person.status === 'active');
  const inRole = active.filter((person) => person.roles.some((role) => role.key === task.roleKey));
  const shown = [...(everyone ? active : inRole)].sort(byLoad);

  const choose = async (userId: string | null) => {
    setError(null);
    try {
      await mutation.mutateAsync(userId);
      onOpenChange(false);
    } catch (caught) {
      setError(describeError(caught));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('title')} description={task.title}>
      <div className="flex flex-col gap-4 pb-3">
        <Checkbox checked={everyone} onCheckedChange={setEveryone} label={t('everyone')} />
        {people.isPending ? (
          <ListSkeleton label={t('loading')} rows={3} />
        ) : shown.length === 0 ? (
          <p className="rounded-lg bg-sunken px-4 py-3 type-body-sm text-ink-muted">
            {t('nobody')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((person) => {
              const current = task.assignee?.id === person.id;
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() => choose(person.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sunken',
                      current && 'bg-accent-soft',
                    )}
                  >
                    <Avatar name={person.fullName} swatch={1} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate type-body-sm font-medium text-ink">
                        {person.fullName}
                      </span>
                      <span className="truncate type-label text-ink-faint">
                        {t('load', { count: person.openTasks })}
                        {person.designation ? ` · ${person.designation}` : ''}
                      </span>
                    </span>
                    {person.onLeave && <Badge variant="outline">{t('onLeave')}</Badge>}
                    <OverloadBadge person={person} />
                    {current && <Check aria-label={t('current')} className="size-4 text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {task.assignee && (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => choose(null)}
            className="flex items-center gap-2 self-start rounded-md px-2 py-1.5 type-body-sm text-ink-muted hover:bg-sunken hover:text-ink"
          >
            <UserX aria-hidden className="size-4" />
            {t('unassign')}
          </button>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 type-body-sm text-overdue">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
