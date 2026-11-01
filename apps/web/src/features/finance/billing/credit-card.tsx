'use client';

import type { CustomerMoneyEntry, ProjectDetail } from '@oneohm/api-contracts';
import { Badge, Button, Card, CardHeader, cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowRightLeft, Undo2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { ApplyCreditDialog } from './apply-credit-dialog';
import { RefundDialog } from './refund-dialog';
import { useProjectBilling } from './use-billing';

const BADGE = { refund: 'outline', credit_received: 'energy', credit_applied: 'soft' } as const;

export function MoneyEntryRow({
  entry,
  showProject = false,
}: {
  readonly entry: CustomerMoneyEntry;
  readonly showProject?: boolean;
}) {
  const t = useTranslations('finance.billing.credit');
  const methodT = useTranslations('finance.methods');
  const format = useFormatter();
  const refund = entry.kind === 'refund';
  const detail = refund ? entry.reason : entry.milestoneLabel;
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 type-body-sm text-ink">
          <Badge variant={BADGE[entry.kind]}>{t(`kind.${entry.kind}`)}</Badge>
          {format.dateTime(new Date(`${entry.date}T12:00:00`), { day: 'numeric', month: 'short' })}
          {' · '}
          {methodT(entry.method)}
        </span>
        <span className="truncate type-body-sm text-ink-faint">
          {[showProject ? `${entry.customerName} · ${entry.projectCode}` : null, detail]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {entry.reference && (
          <span className="truncate font-mono text-[0.6875rem] text-ink-faint">
            {entry.reference}
          </span>
        )}
      </span>
      <span
        className={cn(
          'shrink-0 font-mono text-[0.875rem] tabular-nums',
          refund ? 'text-overdue' : 'text-ink',
        )}
      >
        {refund ? `−${formatInr(entry.amountPaise)}` : formatInr(entry.amountPaise)}
      </span>
    </li>
  );
}

/** Money held for the customer (overpayments) and money paid back to them. */
export function CreditCard({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('finance.billing.credit');
  const canRecord = useCan('finance.record_payments');
  const canRefund = useCan('finance.approve_payments');
  const canView = useCan('finance.view') || canRecord;
  const query = useProjectBilling(project.id, canView);
  const [dialog, setDialog] = useState<'refund' | 'apply' | null>(null);
  const [session, setSession] = useState(0);
  if (!canView) return null;
  const credit = query.data?.creditPaise ?? 0;
  const paidAny = project.milestones.some((m) => m.payer === 'customer' && m.paidPaise > 0);
  const owedAny = project.milestones.some(
    (m) => m.payer === 'customer' && m.amountPaise > m.paidPaise,
  );
  const show = (which: 'refund' | 'apply') => {
    setSession((value) => value + 1);
    setDialog(which);
  };

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      {query.isPending ? (
        <div className="px-5 pb-5">
          <ListSkeleton label={t('loading')} rows={2} />
        </div>
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} className="m-5" />
      ) : (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-sunken/70 px-4 py-3">
            <span className="flex flex-col">
              <span className="type-overline text-ink-faint uppercase">{t('held')}</span>
              <span className="type-title-md text-ink tabular-nums">{formatInr(credit)}</span>
            </span>
            {canRecord && (
              <span className="flex flex-wrap gap-2">
                {credit > 0 && owedAny && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={<ArrowRightLeft />}
                    onClick={() => show('apply')}
                  >
                    {t('apply')}
                  </Button>
                )}
                {canRefund && (credit > 0 || paidAny) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={<Undo2 />}
                    onClick={() => show('refund')}
                  >
                    {t('refund')}
                  </Button>
                )}
              </span>
            )}
          </div>
          {query.data.entries.length === 0 ? (
            <p className="type-body-sm text-ink-faint">{t('empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {query.data.entries.map((entry) => (
                <MoneyEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      )}
      {canRefund && dialog === 'refund' && (
        <RefundDialog
          key={session}
          projectId={project.id}
          creditPaise={credit}
          milestones={project.milestones}
          open
          onClose={() => setDialog(null)}
        />
      )}
      {canRecord && dialog === 'apply' && (
        <ApplyCreditDialog
          key={session}
          projectId={project.id}
          creditPaise={credit}
          milestones={project.milestones}
          open
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}
