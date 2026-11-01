'use client';

import type { ReportStatus } from '@oneohm/api-contracts';
import { Card, CardHeader, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';

const TONE: Readonly<Record<ReportStatus['status'], PillTone>> = {
  ready: 'done',
  missing: 'atRisk',
  not_needed: 'neutral',
};

/**
 * The statutory reports this project needs and whether each has every detail it prints.
 * Missing details name the task that records them, so the fix is one click away.
 */
export function ReportReadiness({
  projectId,
  reports,
}: {
  readonly projectId: string;
  readonly reports: readonly ReportStatus[];
}) {
  const t = useTranslations('projects.reports');
  const canPrint = useCan('reports.generate');
  const ready = reports.filter((report) => report.status === 'ready').length;
  const needed = reports.filter((report) => report.status !== 'not_needed').length;
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={t('title')} description={t('summary', { ready, needed })} />
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {reports.map((report) => (
          <li key={report.key} className="flex flex-col gap-2 px-5 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <FileText aria-hidden className="size-4 shrink-0 text-ink-faint" />
                <span className="truncate type-body-sm font-medium text-ink">{report.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusPill
                  size="sm"
                  tone={TONE[report.status]}
                  label={
                    report.status === 'missing'
                      ? t('missingCount', { count: report.missing.length })
                      : t(`status.${report.status}`)
                  }
                />
                {report.status === 'ready' && canPrint && (
                  <a
                    href={`/api/v1/projects/${projectId}/reports/${report.key}/pdf?disposition=inline`}
                    target="_blank"
                    rel="noopener"
                    title={t('openPdf', { name: report.name })}
                    className="flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-accent"
                  >
                    <Download aria-hidden className="size-4" />
                    <span className="sr-only">{t('openPdf', { name: report.name })}</span>
                  </a>
                )}
              </span>
            </div>
            {report.status === 'missing' && (
              <ul className="flex flex-col gap-1 pl-6.5">
                {report.missing.map((field) => (
                  <li key={field.field} className="type-label text-ink-muted">
                    {field.label}
                    {field.taskTitle && (
                      <span className="text-ink-faint">
                        {' '}
                        · {t('recordedBy', { task: field.taskTitle })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
