'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Card, CardHeader, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { formatInr, formatInrCompact } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { TabLink } from './tab-link';

type Milestone = ProjectDetail['milestones'][number];

const TONE: Readonly<Record<Milestone['status'], PillTone>> = {
  upcoming: 'neutral',
  due: 'atRisk',
  partly_paid: 'waiting',
  paid: 'done',
};

/** Received against the schedule, and the next milestone to collect. */
export function PaymentsSummary({
  project,
  href,
}: {
  readonly project: ProjectDetail;
  readonly href: string;
}) {
  const t = useTranslations('projects.overview.payments');
  const moneyT = useTranslations('projects.money');
  const format = useFormatter();
  const total = project.milestones.reduce((sum, milestone) => sum + milestone.amountPaise, 0);
  const paid = project.milestones.reduce((sum, milestone) => sum + milestone.paidPaise, 0);
  const unpaid = project.milestones.filter((milestone) => milestone.status !== 'paid');
  const next =
    unpaid.find((milestone) => milestone.status === 'due' || milestone.status === 'partly_paid') ??
    unpaid[0];
  const share = total ? Math.min(1, paid / total) : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader title={t('title')} action={<TabLink href={href}>{t('open')}</TabLink>} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="type-display-md text-ink tabular-nums">{formatInrCompact(paid)}</span>
            <span className="type-body-sm text-ink-muted">
              {t('ofTotal', { total: formatInrCompact(total) })}
            </span>
          </p>
          <span
            role="img"
            aria-label={t('share', { percent: Math.round(share * 100) })}
            className="block h-1.5 overflow-hidden rounded-full bg-sunken"
          >
            <span
              className="block h-full rounded-full bg-on-track-solid"
              style={{ width: `${share * 100}%` }}
            />
          </span>
        </div>
        {next ? (
          <div className="flex flex-col gap-1.5 border-t border-hairline pt-4">
            <span className="type-body-sm text-ink-faint">{t('next')}</span>
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 type-body-sm text-ink">{next.label}</span>
              <StatusPill
                size="sm"
                tone={TONE[next.status]}
                label={moneyT(`status.${next.status}`)}
              />
            </div>
            <span className="font-mono text-[0.8125rem] text-ink tabular-nums">
              {formatInr(next.amountPaise - next.paidPaise)}
            </span>
          </div>
        ) : (
          <p className="border-t border-hairline pt-4 type-body-sm text-ink-muted">
            {project.financiallyClosedAt
              ? t('closedOn', {
                  date: format.dateTime(new Date(project.financiallyClosedAt), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }),
                })
              : project.milestones.length === 0
                ? t('noSchedule')
                : t('allPaid')}
          </p>
        )}
      </div>
    </Card>
  );
}
