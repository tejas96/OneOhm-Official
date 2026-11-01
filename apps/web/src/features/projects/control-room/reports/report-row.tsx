'use client';

import type { ReportStatus } from '@oneohm/api-contracts';
import { Button, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { Download, FileText, PencilLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { isProjectFact } from './report-facts-sheet';
import { ReportFilingLine } from './report-filing-line';

const TONE: Readonly<Record<ReportStatus['status'], PillTone>> = {
  ready: 'done',
  missing: 'atRisk',
  not_needed: 'neutral',
};

/**
 * One statutory report: ready, waiting for the task that makes it, or missing details
 * (each named with the task that records it), and its copy in the documents.
 */
export function ReportRow({
  projectId,
  report,
  canPrint,
  submitting,
  onFill,
  onSubmitted,
}: {
  readonly projectId: string;
  readonly report: ReportStatus;
  readonly canPrint: boolean;
  readonly submitting: boolean;
  readonly onFill: () => void;
  readonly onSubmitted: (submitted: boolean) => void;
}) {
  const t = useTranslations('projects.reports');
  const onlyWaiting = report.status === 'missing' && report.missing.length === 0;
  const label = onlyWaiting
    ? t('status.waiting')
    : report.status === 'missing'
      ? t('missingCount', { count: report.missing.length })
      : t(`status.${report.status}`);
  const canFill = canPrint && report.missing.some((item) => isProjectFact(item.field));
  return (
    <li className="flex flex-col gap-2 px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <FileText aria-hidden className="size-4 shrink-0 text-ink-faint" />
          <span className="truncate type-body-sm font-medium text-ink">{report.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <StatusPill
            size="sm"
            tone={onlyWaiting ? 'waiting' : TONE[report.status]}
            label={label}
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
      {report.waitingFor && report.status !== 'not_needed' && (
        <p className="pl-6.5 type-label text-ink-muted">
          {t('waitsFor', { task: report.waitingFor })}
        </p>
      )}
      {report.status === 'missing' && report.missing.length > 0 && (
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
      {canFill && (
        <div className="pl-6.5">
          <Button
            size="sm"
            variant="quiet"
            leadingIcon={<PencilLine aria-hidden />}
            onClick={onFill}
            className="-ml-2"
          >
            {t('fillIn')}
          </Button>
        </div>
      )}
      {report.status !== 'not_needed' && (
        <ReportFilingLine
          report={report}
          canAct={canPrint}
          pending={submitting}
          onSubmitted={onSubmitted}
        />
      )}
    </li>
  );
}
