'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Badge, Button, cn, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { formatInr, formatInrCompact } from '@oneohm/shared';
import { IndianRupee } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import { RecordPaymentDialog } from './record-payment-dialog';

type Milestone = ProjectDetail['milestones'][number];

const STATUS_TONE: Readonly<Record<Milestone['status'], PillTone>> = {
  upcoming: 'neutral',
  due: 'atRisk',
  partly_paid: 'waiting',
  paid: 'done',
};

/** The payment schedule (25 / 65 / 10 and the bank's share), what came in, and recording more. */
export function PaymentPanel({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.money');
  const methodT = useTranslations('projects.money.methods');
  const format = useFormatter();
  const canRecord = useCan('finance.record_payments');
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const total = project.milestones.reduce((sum, milestone) => sum + milestone.amountPaise, 0);
  const paid = project.milestones.reduce((sum, milestone) => sum + milestone.paidPaise, 0);
  const unpaid = project.milestones.filter((milestone) => milestone.status !== 'paid');

  return (
    <section className="oh-panel flex flex-col gap-5 rounded-[28px] p-6 shadow-e3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="type-overline text-on-panel-muted uppercase">{t('title')}</p>
          <p className="type-display-lg text-on-panel tabular-nums">{formatInrCompact(paid)}</p>
          <p className="type-body-sm text-on-panel-muted">
            {t('ofTotal', { total: formatInrCompact(total) })}
          </p>
        </div>
        {canRecord && unpaid.length > 0 && (
          <Button
            variant="panel"
            size="sm"
            leadingIcon={<IndianRupee />}
            onClick={() => {
              setSession((value) => value + 1);
              setOpen(true);
            }}
          >
            {t('record')}
          </Button>
        )}
      </div>
      <span className="h-1.5 overflow-hidden rounded-full bg-on-panel/15">
        <span
          className="oh-brand-line-x block h-full rounded-full"
          style={{ width: `${total ? Math.min(100, (paid / total) * 100) : 0}%` }}
        />
      </span>
      <ul className="flex flex-col gap-2">
        {project.milestones.map((milestone) => (
          <li key={milestone.id} className="flex flex-col gap-2 rounded-xl bg-raised p-4 text-ink">
            <div className="flex items-start justify-between gap-3">
              <p className="type-body-sm font-medium">{milestone.label}</p>
              <StatusPill
                size="sm"
                tone={STATUS_TONE[milestone.status]}
                label={t(`status.${milestone.status}`)}
              />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-title-md tabular-nums">{formatInr(milestone.amountPaise)}</span>
              <span className="flex items-center gap-2 type-label text-ink-faint">
                {milestone.payer === 'bank' && <Badge variant="outline">{t('bank')}</Badge>}
                {milestone.paidPaise > 0 &&
                  milestone.status !== 'paid' &&
                  t('paidSoFar', { amount: formatInr(milestone.paidPaise) })}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {project.payments.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="type-overline text-on-panel-muted uppercase">{t('received')}</p>
          <ul className="flex flex-col divide-y divide-on-panel/12">
            {project.payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="type-body-sm text-on-panel">
                    {format.dateTime(new Date(payment.receivedOn), {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    · {methodT(payment.method)}
                  </span>
                  {payment.reference && (
                    <span className="truncate font-mono text-[0.6875rem] text-on-panel-muted">
                      {payment.reference}
                    </span>
                  )}
                </span>
                <span className={cn('type-body-sm font-medium text-on-panel tabular-nums')}>
                  {formatInr(payment.amountPaise)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {canRecord && (
        <RecordPaymentDialog
          key={session}
          projectId={project.id}
          milestones={unpaid}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </section>
  );
}
