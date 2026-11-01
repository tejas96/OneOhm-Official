'use client';

import type { ReportStatus } from '@oneohm/api-contracts';
import { Card, CardHeader, cn, StatusGlyph } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { TabLink } from './tab-link';

const SHOWN = 3;

/** How many statutory reports are ready to print, and the first ones still missing details. */
export function ReportsSummary({
  reports,
  href,
}: {
  readonly reports: readonly ReportStatus[];
  readonly href: string;
}) {
  const t = useTranslations('projects.overview.reports');
  const reportsT = useTranslations('projects.reports');
  const ready = reports.filter((report) => report.status === 'ready').length;
  const missing = reports.filter((report) => report.status === 'missing');
  const needed = reports.filter((report) => report.status !== 'not_needed').length;

  return (
    <Card className="flex flex-col">
      <CardHeader title={t('title')} action={<TabLink href={href}>{t('open')}</TabLink>} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="type-display-md text-ink tabular-nums">{ready}</span>
            <span className="type-body-sm text-ink-muted">{t('ofTotal', { total: needed })}</span>
          </p>
          <ol aria-label={t('ready', { ready, total: needed })} className="flex gap-[3px]">
            {reports.map((report) => (
              <li
                key={report.key}
                aria-label={`${report.name}, ${reportsT(`status.${report.status}`)}`}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  report.status === 'ready' && 'bg-on-track-solid',
                  report.status === 'missing' && 'bg-sunken',
                  report.status === 'not_needed' && 'oh-hatch bg-sunken',
                )}
              />
            ))}
          </ol>
        </div>
        {missing.length === 0 ? (
          <p className="border-t border-hairline pt-4 type-body-sm text-ink-muted">
            {t('allReady')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 border-t border-hairline pt-4">
            {missing.slice(0, SHOWN).map((report) => (
              <li key={report.key} className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-start gap-2 type-body-sm text-ink">
                  <StatusGlyph name="atRisk" className="mt-0.5 size-3.5 shrink-0 text-at-risk" />
                  {report.name}
                </span>
                <span className="shrink-0 type-label text-ink-faint">
                  {reportsT('missingCount', { count: report.missing.length })}
                </span>
              </li>
            ))}
            {missing.length > SHOWN && (
              <li className="type-label text-ink-faint">
                {t('more', { count: missing.length - SHOWN })}
              </li>
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}
