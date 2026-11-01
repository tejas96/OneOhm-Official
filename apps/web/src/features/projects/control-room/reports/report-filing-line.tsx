'use client';

import type { ReportStatus } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { CircleAlert, Send, Undo2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * Where a report stands in the project documents (PRD 3.18): saved when, handed in
 * when, and a calm warning when its details changed after it was handed in.
 */
export function ReportFilingLine({
  report,
  canAct,
  pending,
  onSubmitted,
}: {
  readonly report: ReportStatus;
  readonly canAct: boolean;
  readonly pending: boolean;
  readonly onSubmitted: (submitted: boolean) => void;
}) {
  const t = useTranslations('projects.reports.filing');
  const format = useFormatter();
  const filing = report.filing;
  if (!filing || (!filing.savedAt && report.status !== 'ready')) return null;
  const day = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'short' });
  // A copy saved before the report was complete is replaced once it is ready.
  if (report.status !== 'ready' && !filing.submittedAt && filing.savedAt) {
    return (
      <p className="pl-6.5 type-label text-ink-faint">
        {t('earlierCopy', { date: day(filing.savedAt) })}
      </p>
    );
  }
  const parts = [
    filing.savedAt ? t('saved', { date: day(filing.savedAt) }) : t('notSaved'),
    filing.submittedAt ? t('submitted', { date: day(filing.submittedAt) }) : null,
  ].filter(Boolean);
  const warning = filing.changedAfterSubmission
    ? t('changedAfterSubmission')
    : filing.changedSinceSaved && !filing.submittedAt
      ? t('changedSinceSaved')
      : null;
  return (
    <div className="flex flex-col gap-1.5 pl-6.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="type-label text-ink-faint">{parts.join(' · ')}</span>
        {canAct && filing.submittedAt && (
          <Button
            size="sm"
            variant="quiet"
            leadingIcon={<Undo2 aria-hidden />}
            pending={pending}
            onClick={() => onSubmitted(false)}
            className="-ml-2"
          >
            {t('undo')}
          </Button>
        )}
        {canAct && !filing.submittedAt && report.status === 'ready' && (
          <Button
            size="sm"
            variant="quiet"
            leadingIcon={<Send aria-hidden />}
            pending={pending}
            onClick={() => onSubmitted(true)}
            className="-ml-2"
          >
            {t('markSubmitted')}
          </Button>
        )}
      </div>
      {warning && (
        <p className="flex items-start gap-1.5 type-label text-at-risk">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {warning}
        </p>
      )}
    </div>
  );
}
