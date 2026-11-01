'use client';

import { Card, CardHeader, cn, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LoadError } from '@/components/query-state';
import { useFinanceOverview } from '../use-finance';
import { AgeingBars } from './ageing-bars';
import { CashFlowChart } from './cash-flow-chart';

const TILE = 'flex flex-col gap-2 rounded-[28px] bg-raised p-6 shadow-e1 ring-1 ring-hairline/70';

function Tile({
  label,
  value,
  note,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly note: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn(TILE, className)}>
      <p className="type-overline text-ink-faint uppercase">{label}</p>
      <p className="type-display-lg text-ink tabular-nums">{value}</p>
      <p className="type-body-sm text-ink-muted">{note}</p>
    </section>
  );
}

/** Cash in hand and bank, who owes what and for how long, and the bills coming up. */
export function OverviewTab() {
  const t = useTranslations('finance.overview');
  const query = useFinanceOverview();
  if (query.isPending) {
    return (
      <SkeletonGroup label={t('loading')} className="grid gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="h-36 rounded-[28px]" />
        ))}
      </SkeletonGroup>
    );
  }
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const { balances, receivables, payables, monthly } = query.data;
  const billsOpen = payables.awaitingApprovalPaise + payables.approvedUnpaidPaise;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className={cn('oh-panel flex flex-col gap-2 rounded-[28px] p-6 shadow-e3')}>
          <p className="type-overline text-on-panel-muted uppercase">{t('bank')}</p>
          <p className="type-display-lg text-on-panel tabular-nums">
            {formatInrCompact(balances.bankPaise + balances.gatewayPaise)}
          </p>
          <p className="type-body-sm text-on-panel-muted">
            {t('cashInHand', { amount: formatInrCompact(balances.cashPaise) })}
          </p>
        </section>
        <Tile
          label={t('customersOwe')}
          value={formatInrCompact(receivables.customerPaise)}
          note={t('notDueYet', { amount: formatInrCompact(receivables.notDueYetPaise) })}
        />
        <Tile
          label={t('banksOwe')}
          value={formatInrCompact(receivables.bankPaise)}
          note={t('banksNote')}
        />
        <Tile
          label={t('billsOpen')}
          value={formatInrCompact(billsOpen)}
          note={t('billsNote', {
            count: payables.awaitingApprovalCount,
            overdue: formatInrCompact(payables.overduePaise),
          })}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title={t('cashFlow.title')} description={t('cashFlow.description')} />
          <div className="px-5 pb-5">
            <CashFlowChart months={monthly} />
          </div>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader title={t('ageing.title')} description={t('ageing.description')} />
          <div className="flex flex-col gap-5 px-5 pb-5">
            <AgeingBars ageing={receivables.ageing} />
            {receivables.advancesPaise > 0 && (
              <p className="rounded-lg bg-sunken/70 px-3 py-2.5 type-body-sm text-ink-muted">
                {t('advances', { amount: formatInrCompact(receivables.advancesPaise) })}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
