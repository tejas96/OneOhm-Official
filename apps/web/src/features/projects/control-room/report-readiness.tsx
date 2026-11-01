'use client';

import type { ReportKey, ReportStatus } from '@oneohm/api-contracts';
import { Card, CardHeader } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import { ReportFactsSheet } from './reports/report-facts-sheet';
import { ReportRow } from './reports/report-row';
import { useReportActions } from './reports/use-report-actions';

/**
 * The statutory reports this project needs (PRD 3.18): whether each has every detail it
 * prints and the task that makes it is done, its copy in the documents, and whether it
 * was handed in. Missing details name the task that records them, and can be filled here.
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
  const { submission, facts } = useReportActions(projectId);
  const [filling, setFilling] = useState<ReportStatus | null>(null);
  const ready = reports.filter((report) => report.status === 'ready').length;
  const needed = reports.filter((report) => report.status !== 'not_needed').length;
  return (
    <Card id="reports" className="flex scroll-mt-24 flex-col overflow-hidden">
      <CardHeader title={t('title')} description={t('summary', { ready, needed })} />
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {reports.map((report) => (
          <ReportRow
            key={report.key}
            projectId={projectId}
            report={report}
            canPrint={canPrint}
            submitting={submission.isPending && submission.variables?.key === report.key}
            onFill={() => setFilling(report)}
            onSubmitted={(submitted) =>
              submission.mutate({ key: report.key as ReportKey, submitted })
            }
          />
        ))}
      </ul>
      <ReportFactsSheet report={filling} onClose={() => setFilling(null)} mutation={facts} />
    </Card>
  );
}
