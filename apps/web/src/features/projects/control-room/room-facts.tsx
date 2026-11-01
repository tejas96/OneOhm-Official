'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Avatar, cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Phone } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { swatchFor } from '../tasks/task-card';

function Cell({
  label,
  children,
  className,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 bg-raised px-4 py-3', className)}>
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="flex min-h-6 min-w-0 items-center gap-2 type-body-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * The project's title block, as on a drawing sheet: who it is for, who runs it, what it
 * is worth after subsidy, when it started and which DISCOM it answers to.
 */
export function RoomFacts({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.room.facts');
  const format = useFormatter();
  const money = (paise: number) => (
    <span className="truncate tabular-nums">{formatInr(paise)}</span>
  );
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-4 xl:grid-cols-7">
      <Cell label={t('customer')} className="col-span-2 xl:col-span-1">
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{project.customer.name}</span>
          <a
            href={`tel:${project.customer.phone}`}
            className="inline-flex items-center gap-1 self-start font-mono text-[0.75rem] text-accent hover:underline"
          >
            <Phone aria-hidden className="size-3" />
            {project.customer.phone}
          </a>
        </span>
      </Cell>
      <Cell label={t('manager')}>
        {project.manager ? (
          <>
            <Avatar
              name={project.manager.fullName}
              swatch={swatchFor(project.manager.fullName)}
              size="sm"
              className="size-5 text-[0.5625rem]"
            />
            <span className="truncate">{project.manager.fullName}</span>
          </>
        ) : (
          <span className="text-at-risk">{t('noManager')}</span>
        )}
      </Cell>
      <Cell label={t('value')}>{money(project.quotation.totalPaise)}</Cell>
      <Cell label={t('subsidy')}>{money(project.quotation.subsidyPaise)}</Cell>
      <Cell label={t('effective')}>{money(project.quotation.effectivePaise)}</Cell>
      <Cell label={t('started')}>
        <time dateTime={project.startDate} className="truncate">
          {format.dateTime(new Date(project.startDate), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </time>
      </Cell>
      <Cell label={t('discom')}>
        <span className="truncate">{project.discom}</span>
      </Cell>
    </dl>
  );
}
