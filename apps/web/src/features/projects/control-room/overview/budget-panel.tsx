'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Card, CardHeader, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { BudgetActions } from '@/features/projects/team/budget-actions';

const TONE: Readonly<Record<ProjectDetail['budget']['status'], PillTone>> = {
  awaiting_survey: 'neutral',
  locked: 'onTrack',
  revision_needed: 'review',
  revised: 'onTrack',
};

/** Whether the survey confirmed the price: waiting, locked, or a revision to approve. */
export function BudgetPanel({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.overview.budget');
  const format = useFormatter();
  const { budget } = project;
  const variance = budget.variancePaise;
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('title')}
        action={
          <StatusPill size="sm" tone={TONE[budget.status]} label={t(`status.${budget.status}`)} />
        }
      />
      <div className="flex flex-col gap-2 px-5 pb-5">
        <p className="type-body-sm text-ink-muted">{t(`explain.${budget.status}`)}</p>
        {variance !== null && budget.varianceBp !== null && (
          <p className="flex items-baseline justify-between gap-3 border-t border-hairline pt-3">
            <span className="type-body-sm text-ink-faint">{t('variance')}</span>
            <span className="font-mono text-ink tabular-nums">
              {variance >= 0 ? '+' : '−'}
              {formatInr(Math.abs(variance))} ({(budget.varianceBp / 100).toFixed(1)}%)
            </span>
          </p>
        )}
        {budget.lockedAt && (
          <p className="type-label text-ink-faint">
            {t('lockedOn', {
              date: format.dateTime(new Date(budget.lockedAt), { day: 'numeric', month: 'short' }),
            })}
          </p>
        )}
        {budget.revisionQuotationId && (
          <Link
            href={`/quotations/${budget.revisionQuotationId}`}
            className="inline-flex items-center gap-1 type-body-sm text-accent hover:underline"
          >
            {t('openRevision')}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
        <BudgetActions project={project} />
      </div>
    </Card>
  );
}
