'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Avatar, Card, CardHeader, easing, seconds } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { swatchFor } from '../../tasks/task-card';

interface Member {
  readonly id: string;
  readonly name: string;
  readonly manager: boolean;
  readonly open: number;
  readonly done: number;
}

function membersOf(project: ProjectDetail): Member[] {
  const people = new Map<string, Member>();
  if (project.manager)
    people.set(project.manager.id, {
      id: project.manager.id,
      name: project.manager.fullName,
      manager: true,
      open: 0,
      done: 0,
    });
  for (const task of project.tasks) {
    if (!task.assignee) continue;
    const current = people.get(task.assignee.id) ?? {
      id: task.assignee.id,
      name: task.assignee.fullName,
      manager: false,
      open: 0,
      done: 0,
    };
    const done = task.status === 'completed';
    people.set(task.assignee.id, {
      ...current,
      open: current.open + (done ? 0 : 1),
      done: current.done + (done ? 1 : 0),
    });
  }
  return [...people.values()];
}

/** Who is on the project and how much open work each of them holds here. */
export function TeamPanel({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.overview.team');
  const members = membersOf(project);
  const largest = Math.max(0, ...members.map((member) => member.open));
  const unowned = project.tasks.filter(
    (task) => task.status !== 'completed' && task.assignee === null,
  ).length;

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description', { count: members.length })} />
      <ul className="flex flex-col gap-3 px-5 pb-5">
        {members.map((member, index) => (
          <li key={member.id} className="flex items-center gap-3">
            <Avatar name={member.name} swatch={swatchFor(member.name)} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex items-baseline justify-between gap-2 type-body-sm">
                <span className="truncate text-ink">{member.name}</span>
                <span className="shrink-0 text-ink-faint tabular-nums">
                  {t('open', { count: member.open })}
                </span>
              </p>
              <p className="type-label text-ink-faint">
                {member.manager ? t('manager') : t('done', { count: member.done })}
              </p>
              {largest > 0 && (
                <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-sunken">
                  <motion.span
                    className="block h-full origin-left rounded-full bg-ink-faint"
                    style={{ width: `${(member.open / largest) * 100}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: seconds('data'),
                      ease: easing('outExpo'),
                      delay: index * 0.04,
                    }}
                  />
                </span>
              )}
            </div>
          </li>
        ))}
        {unowned > 0 && (
          <li className="border-t border-hairline pt-3 type-body-sm text-at-risk">
            {t('unowned', { count: unowned })}
          </li>
        )}
      </ul>
    </Card>
  );
}
