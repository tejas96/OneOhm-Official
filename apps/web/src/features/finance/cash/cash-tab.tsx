'use client';

import type { CashPosition, HandledPayment } from '@oneohm/api-contracts';
import { Button, Card, CardHeader, EmptyState } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Landmark, Wallet, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { type ChequeAction, ChequeDialog } from './cheque-dialog';
import { DepositSheet } from './deposit-sheet';
import { DepositsTable } from './deposits-table';
import { OpenMoneyTable } from './open-money-table';
import { useCashPosition, useDeposits } from './use-cash';

/**
 * Cash and cheques from collection to the bank (PRD 3.11): who holds what and for how
 * long, deposit slips, and cheques waiting to clear.
 */
export function CashTab() {
  const t = useTranslations('finance.cash');
  const canRecord = useCan('finance.record_payments');
  const canBounce = useCan('finance.approve_payments');
  const position = useCashPosition();
  const deposits = useDeposits();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [depositing, setDepositing] = useState(false);
  const [cheque, setCheque] = useState<ChequeAction | null>(null);
  const open = position.data?.open ?? [];
  const chosen = open.filter((item) => picked.has(item.paymentId));
  const toggle = (row: HandledPayment) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(row.paymentId)) next.delete(row.paymentId);
      else next.add(row.paymentId);
      return next;
    });
  const chosenTotal = chosen.reduce((sum, item) => sum + item.amountPaise, 0);

  return (
    <section className="flex flex-col gap-8">
      {position.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {position.isError && <LoadError error={position.error} onRetry={() => position.refetch()} />}
      {position.data && <Figures position={position.data} />}
      {position.data && (
        <Card>
          <CardHeader
            title={t('openTitle')}
            description={t('openIntro', { days: position.data.alertDays })}
          />
          <div className="px-2 pb-3">
            {open.length === 0 ? (
              <EmptyState icon={<Wallet />} title={t('allBanked')} />
            ) : (
              <OpenMoneyTable
                rows={open}
                alertDays={position.data.alertDays}
                picked={picked}
                onToggle={canRecord ? toggle : null}
                canRecord={canRecord}
                canBounce={canBounce}
                onClear={(row) => setCheque({ kind: 'clear', cheque: row })}
                onBounce={(row) => setCheque({ kind: 'bounce', cheque: row })}
              />
            )}
          </div>
        </Card>
      )}
      {canRecord && chosen.length > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-raised/95 px-4 py-3 shadow-e3 backdrop-blur">
          <span className="mr-auto type-body-sm font-medium text-ink">
            {t('picked', { count: chosen.length, amount: formatInr(chosenTotal) })}
          </span>
          <Button
            size="sm"
            variant="quiet"
            leadingIcon={<X />}
            onClick={() => setPicked(new Set())}
          >
            {t('unpick')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<Landmark />}
            onClick={() => setDepositing(true)}
          >
            {t('depositAction')}
          </Button>
        </div>
      )}
      <Card>
        <CardHeader title={t('deposits.title')} description={t('deposits.intro')} />
        <div className="px-2 pb-3">
          {deposits.isPending && <ListSkeleton label={t('loading')} rows={2} />}
          {deposits.data && deposits.data.length === 0 && (
            <p className="px-3 pb-3 type-body-sm text-ink-faint">{t('deposits.empty')}</p>
          )}
          {deposits.data && deposits.data.length > 0 && <DepositsTable deposits={deposits.data} />}
        </div>
      </Card>
      <DepositSheet
        items={chosen}
        open={depositing}
        onOpenChange={setDepositing}
        onDone={() => {
          setDepositing(false);
          setPicked(new Set());
        }}
      />
      <ChequeDialog
        key={cheque?.cheque.paymentId ?? 'none'}
        action={cheque}
        onClose={() => setCheque(null)}
      />
    </section>
  );
}

function Figures({ position }: { readonly position: CashPosition }) {
  const t = useTranslations('finance.cash.figures');
  const oldest = Math.max(0, ...position.collectors.map((collector) => collector.oldestDays));
  const late = oldest > position.alertDays;
  const tiles = [
    {
      key: 'cash',
      value: formatInr(position.cashInHandPaise),
      note: t('cashNote', { count: position.collectors.length }),
    },
    { key: 'cheques', value: formatInr(position.chequesOpenPaise), note: t('chequesNote') },
    { key: 'oldest', value: t('days', { days: oldest }), note: late ? t('late') : t('onTime') },
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="flex flex-col gap-1 rounded-xl border border-hairline bg-raised p-4"
          >
            <dt className="type-label text-ink-faint">{t(tile.key)}</dt>
            <dd
              className={`type-display-md tabular-nums ${tile.key === 'oldest' && late ? 'text-overdue' : 'text-ink'}`}
            >
              {tile.value}
            </dd>
            <dd className="type-body-sm text-ink-faint">{tile.note}</dd>
          </div>
        ))}
      </dl>
      {position.collectors.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {position.collectors.map((collector) => (
            <li
              key={collector.userId ?? 'unknown'}
              className="rounded-full border border-hairline px-3 py-1 type-body-sm text-ink-muted"
            >
              {t('collector', {
                name: collector.name ?? t('unknown'),
                amount: formatInr(collector.totalPaise),
                days: collector.oldestDays,
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
