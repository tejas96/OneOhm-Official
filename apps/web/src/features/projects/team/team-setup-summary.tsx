'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Badge } from '@oneohm/design-system/web';
import { useFormatter, useTranslations } from 'next-intl';

/** The project's contractor, named team and target finish, under its people (PRD 3.8). */
export function TeamSetupSummary({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projectTeam.panel');
  const format = useFormatter();
  const { contractor, team, targetFinishDate } = project.setup;
  const outside = project.tasks.filter(
    (task) => task.outsideTeam && task.status !== 'completed',
  ).length;
  return (
    <dl className="flex flex-col gap-3 border-t border-hairline pt-3">
      <div className="flex flex-col gap-0.5">
        <dt className="type-body-sm text-ink-faint">{t('contractor')}</dt>
        <dd className="flex flex-wrap items-center gap-2 type-body-sm text-ink">
          {contractor?.name ?? t('noContractor')}
          {contractor && !contractor.active && <Badge variant="soft">{t('contractorOff')}</Badge>}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="type-body-sm text-ink-faint">{t('named')}</dt>
        <dd className="type-body-sm text-ink">
          {team.length > 0 ? team.map((member) => member.fullName).join(', ') : t('anyone')}
        </dd>
      </div>
      {targetFinishDate && (
        <div className="flex flex-col gap-0.5">
          <dt className="type-body-sm text-ink-faint">{t('targetFinish')}</dt>
          <dd className="type-body-sm text-ink">
            {format.dateTime(new Date(`${targetFinishDate}T00:00:00`), {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </dd>
        </div>
      )}
      {outside > 0 && (
        <p className="type-body-sm text-at-risk">{t('outside', { count: outside })}</p>
      )}
    </dl>
  );
}
