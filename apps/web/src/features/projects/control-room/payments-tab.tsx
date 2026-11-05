'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Card, CardHeader, cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { CreditCard } from '@/features/finance/billing/credit-card';
import { InvoiceCard } from '@/features/finance/billing/invoice-card';
import { SurveyCreditCard } from '@/features/self-survey/credit-card';
import { PaymentPanel } from './payment-panel';

type Milestone = ProjectDetail['milestones'][number];

const left = (milestone: Milestone) => milestone.amountPaise - milestone.paidPaise;
const sum = (milestones: readonly Milestone[], value: (milestone: Milestone) => number) =>
  milestones.reduce((total, milestone) => total + value(milestone), 0);

function Row({
  label,
  paise,
  tone,
}: {
  readonly label: string;
  readonly paise: number;
  readonly tone?: 'due' | 'muted';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 py-3">
      <dt className="type-body-sm text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'font-mono text-[0.875rem] tabular-nums',
          tone === 'due' && paise > 0 ? 'font-medium text-at-risk' : 'text-ink',
          tone === 'muted' && 'text-ink-muted',
        )}
      >
        {formatInr(paise)}
      </dd>
    </div>
  );
}

/** The payment schedule with room to work in, and the money position beside it. */
export function PaymentsTab({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.paymentsTab');
  const { milestones } = project;
  const dueNow = milestones.filter(
    (milestone) => milestone.status === 'due' || milestone.status === 'partly_paid',
  );
  const later = milestones.filter((milestone) => milestone.status === 'upcoming');
  const bank = milestones.filter((milestone) => milestone.payer === 'bank');

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <PaymentPanel project={project} />
          <SurveyCreditCard projectId={project.id} />
        </div>
        <Card>
          <CardHeader title={t('positionTitle')} description={t('positionBody')} />
          <dl className="flex flex-col divide-y divide-hairline border-t border-hairline">
            <Row
              label={t('scheduled')}
              paise={sum(milestones, (milestone) => milestone.amountPaise)}
            />
            <Row
              label={t('received')}
              paise={sum(milestones, (milestone) => milestone.paidPaise)}
            />
            <Row label={t('dueNow')} paise={sum(dueNow, left)} tone="due" />
            <Row label={t('later')} paise={sum(later, left)} />
            {bank.length > 0 && (
              <Row label={t('bankShare')} paise={sum(bank, (milestone) => milestone.amountPaise)} />
            )}
            <Row label={t('subsidy')} paise={project.quotation.subsidyPaise} tone="muted" />
          </dl>
        </Card>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <InvoiceCard projectId={project.id} customerName={project.customer.name} />
        <CreditCard project={project} />
      </div>
    </div>
  );
}
