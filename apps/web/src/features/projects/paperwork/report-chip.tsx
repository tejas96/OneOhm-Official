'use client';

import type { ReportStatus } from '@oneohm/api-contracts';
import { cn, Tooltip } from '@oneohm/design-system/web';
import { CircleAlert, Download, Minus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const BASE =
  'flex h-10 min-w-0 items-center gap-2 rounded-lg px-3 type-label transition-colors duration-(--duration-fast)';

/** One report for one project: download when ready, what is missing when not. */
export function ReportChip({
  projectId,
  report,
}: {
  readonly projectId: string;
  readonly report: ReportStatus;
}) {
  const t = useTranslations('reports');
  if (report.status === 'not_needed') {
    return (
      <span className={cn(BASE, 'bg-sunken/60 text-ink-faint')} title={t('notNeeded')}>
        <Minus aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{t('notNeeded')}</span>
      </span>
    );
  }
  if (report.status === 'ready') {
    return (
      <a
        href={`/api/v1/projects/${projectId}/reports/${report.key}/pdf?disposition=inline`}
        target="_blank"
        rel="noopener"
        className={cn(
          BASE,
          'bg-on-track-tint text-on-track hover:bg-on-track hover:text-on-accent',
        )}
      >
        <Download aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{t('download')}</span>
        <span className="sr-only">{report.name}</span>
      </a>
    );
  }
  return (
    <Tooltip
      content={
        <ul className="flex flex-col gap-0.5">
          {report.missing.map((field) => (
            <li key={field.field}>{field.label}</li>
          ))}
        </ul>
      }
    >
      <Link
        href={`/projects/${projectId}?tab=reports`}
        className={cn(BASE, 'bg-at-risk-tint text-at-risk hover:ring-1 hover:ring-at-risk/40')}
      >
        <CircleAlert aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{t('missing', { count: report.missing.length })}</span>
        <span className="sr-only">{report.name}</span>
      </Link>
    </Tooltip>
  );
}
