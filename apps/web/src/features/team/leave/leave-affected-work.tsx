'use client';

import type { LeaveImpact } from '@oneohm/api-contracts';
import { Badge } from '@oneohm/design-system/web';
import { ClipboardList, Headset, PhoneCall } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useWorkforceFormat } from '../workforce-format';

type Reason = NonNullable<LeaveImpact['tasks'][number]['reason']>;

/** The number of open items a leave touches: tasks, service requests and follow-ups. */
export const affectedCount = (impact: LeaveImpact) =>
  impact.tasks.length + impact.serviceRequests.length + impact.followUps.length;

function Group({
  icon,
  title,
  children,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 type-label text-ink-faint">
        <span aria-hidden className="[&_svg]:size-3.5">
          {icon}
        </span>
        {title}
      </p>
      <ul className="flex flex-col divide-y divide-hairline rounded-md bg-sunken/70">{children}</ul>
    </div>
  );
}

function Row({ main, detail, end }: { main: string; detail: string; end?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="truncate type-body-sm text-ink">{main}</span>
        <span className="truncate type-label text-ink-faint">{detail}</span>
      </span>
      {end}
    </li>
  );
}

/**
 * What a leave touches (PRD Flow E): open tasks already late, due while away or running
 * through it; service requests the person holds; and lead follow-ups falling due.
 */
export function LeaveAffectedWork({ impact }: { readonly impact: LeaveImpact }) {
  const t = useTranslations('team.leave.affected');
  const format = useWorkforceFormat();
  const reasonLabel = (reason: Reason | undefined) => t(`reason.${reason ?? 'due'}`);
  if (affectedCount(impact) === 0) {
    return <p className="type-body-sm text-ink-muted">{t('nothing')}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {impact.tasks.length > 0 && (
        <Group icon={<ClipboardList />} title={t('tasks', { count: impact.tasks.length })}>
          {impact.tasks.map((task) => (
            <Row
              key={task.id}
              main={task.title}
              detail={t('taskDetail', { code: task.projectCode, day: format.day(task.dueDate) })}
              end={
                <Badge variant={task.reason === 'overdue' ? 'energy' : 'outline'}>
                  {reasonLabel(task.reason)}
                </Badge>
              }
            />
          ))}
        </Group>
      )}
      {impact.serviceRequests.length > 0 && (
        <Group icon={<Headset />} title={t('service', { count: impact.serviceRequests.length })}>
          {impact.serviceRequests.map((request) => (
            <Row key={request.id} main={request.title} detail={request.customerName} />
          ))}
        </Group>
      )}
      {impact.followUps.length > 0 && (
        <Group icon={<PhoneCall />} title={t('followUps', { count: impact.followUps.length })}>
          {impact.followUps.map((lead) => (
            <Row
              key={lead.id}
              main={lead.name}
              detail={t('followUpOn', { day: format.day(lead.nextActionOn) })}
            />
          ))}
        </Group>
      )}
      {impact.projectCodes.length > 0 && (
        <p className="type-body-sm text-ink-faint">
          {t('managersTold', { projects: impact.projectCodes.join(', ') })}
        </p>
      )}
    </div>
  );
}
