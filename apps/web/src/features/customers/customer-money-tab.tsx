'use client';

import type { CustomerActivity } from '@oneohm/api-contracts';
import { Card, cn, EmptyState } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { IndianRupee } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CustomerChangeRequests } from './customer-change-requests';
import { CustomerPayments } from './customer-payments';
import { ProjectMoneyCard } from './customer-project-money';

function Figure({
  label,
  paise,
  tone,
}: {
  readonly label: string;
  readonly paise: number;
  readonly tone?: 'due' | 'muted';
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <dt className="type-label text-ink-faint">{label}</dt>
      <dd
        className={cn(
          'type-display-md tabular-nums',
          tone === 'due' && paise > 0 ? 'text-at-risk' : 'text-ink',
          tone === 'muted' && 'text-ink-muted',
        )}
      >
        {formatInrCompact(paise)}
      </dd>
    </div>
  );
}

/** Money across every project: what is scheduled, received and still to collect. */
export function CustomerMoneyTab({ activity }: { readonly activity: CustomerActivity }) {
  const t = useTranslations('customers.money');
  const live = activity.projects.filter((project) => project.status !== 'cancelled');
  const milestones = live.flatMap((project) => project.milestones);
  const total = (pick: (row: (typeof milestones)[number]) => number) =>
    milestones.reduce((sum, row) => sum + pick(row), 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <dl className="grid grid-cols-2 divide-hairline lg:grid-cols-4 lg:divide-x [&>div]:border-hairline max-lg:[&>div:nth-child(-n+2)]:border-b max-lg:[&>div:nth-child(odd)]:border-r">
          <Figure label={t('scheduled')} paise={total((row) => row.amountPaise)} />
          <Figure label={t('received')} paise={total((row) => row.paidPaise)} />
          <Figure
            label={t('outstanding')}
            paise={total((row) => row.outstandingPaise)}
            tone="due"
          />
          <Figure
            label={t('subsidy')}
            paise={live.reduce((sum, project) => sum + project.subsidyPaise, 0)}
            tone="muted"
          />
        </dl>
        <p className="border-t border-hairline px-5 py-3 type-body-sm text-ink-faint">
          {t('subsidyHint')}
        </p>
      </Card>
      {activity.projects.length === 0 ? (
        <EmptyState icon={<IndianRupee />} title={t('none')} />
      ) : (
        activity.projects.map((project) => <ProjectMoneyCard key={project.id} project={project} />)
      )}
      <CustomerPayments payments={activity.payments} />
      <CustomerChangeRequests requests={activity.changeRequests} />
    </div>
  );
}
