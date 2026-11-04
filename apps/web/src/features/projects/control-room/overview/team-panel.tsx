'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Avatar, Button, Card, CardHeader, easing, seconds } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TeamSetupSummary } from '@/features/projects/team/team-setup-summary';
import { TeamSheet } from '@/features/projects/team/team-sheet';
import { useCan } from '@/providers/current-user';
import { swatchFor } from '../../tasks/task-card';
import { type PanelPerson, panelPeople } from './panel-people';

/** Who is on the project and how much open work each of them holds here. */
export function TeamPanel({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.overview.team');
  const panelT = useTranslations('projectTeam.panel');
  const canManage = useCan('projects.manage');
  const [editing, setEditing] = useState(false);
  const { manager, team, others, othersHeading } = panelPeople(project);
  const members = [...(manager ? [manager] : []), ...team, ...others];
  const largest = Math.max(0, ...members.map((member) => member.open));
  const open = project.status !== 'completed' && project.status !== 'cancelled';
  const row = (member: PanelPerson, role: string | null) => (
    <PersonRow
      key={member.id}
      member={member}
      index={members.indexOf(member)}
      largest={largest}
      role={role}
    />
  );
  const unowned = project.tasks.filter(
    (task) => task.status !== 'completed' && task.assignee === null,
  ).length;

  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('description', { count: members.length })}
        action={
          canManage && open ? (
            <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>
              {panelT('change')}
            </Button>
          ) : undefined
        }
      />
      <ul className="flex flex-col gap-3 px-5 pb-5">
        {manager && row(manager, t('manager'))}
        {team.map((member) => row(member, null))}
        {project.setup.team.length === 0 && (
          <li className="type-body-sm text-ink-faint">{panelT('anyone')}</li>
        )}
        {othersHeading && (
          <li className="border-t border-hairline pt-3 type-label text-ink-faint">
            {t('notOnTeam')}
          </li>
        )}
        {others.map((member) => row(member, null))}
        {unowned > 0 && (
          <li className="border-t border-hairline pt-3 type-body-sm text-at-risk">
            {t('unowned', { count: unowned })}
          </li>
        )}
        <li>
          <TeamSetupSummary project={project} />
        </li>
      </ul>
      <TeamSheet project={project} open={editing} onClose={() => setEditing(false)} />
    </Card>
  );
}

function PersonRow({
  member,
  index,
  largest,
  role,
}: {
  readonly member: PanelPerson;
  readonly index: number;
  readonly largest: number;
  readonly role: string | null;
}) {
  const t = useTranslations('projects.overview.team');
  return (
    <li className="flex items-center gap-3">
      <Avatar name={member.name} swatch={swatchFor(member.name)} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-baseline justify-between gap-2 type-body-sm">
          <span className="truncate text-ink">
            {member.name}
            {member.inactive && <span className="text-ink-faint"> {t('inactive')}</span>}
          </span>
          <span className="shrink-0 text-ink-faint tabular-nums">
            {t('open', { count: member.open })}
          </span>
        </p>
        <p className="type-label text-ink-faint">{role ?? t('done', { count: member.done })}</p>
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
  );
}
