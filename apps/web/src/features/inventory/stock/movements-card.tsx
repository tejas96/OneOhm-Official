'use client';

import type { StockMovement } from '@oneohm/api-contracts';
import { Card, CardHeader, cn } from '@oneohm/design-system/web';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Lock,
  type LucideIcon,
  SlidersHorizontal,
  Unlock,
} from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { formatQuantity, useMovements } from '../use-inventory';

const ICON: Readonly<Record<StockMovement['kind'], LucideIcon>> = {
  receipt: ArrowDownToLine,
  reservation: Lock,
  release: Unlock,
  dispatch: ArrowUpFromLine,
  adjustment: SlidersHorizontal,
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${formatQuantity(value)}`;

/** The stock ledger: what changed, by how much, why and who. */
export function MovementsCard() {
  const t = useTranslations('inventory.stock');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const movements = useMovements();
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={t('movementsTitle')} description={t('movementsDescription')} />
      <div className="border-t border-hairline">
        {movements.isPending && (
          <div className="p-5">
            <ListSkeleton label={t('movementsTitle')} rows={3} />
          </div>
        )}
        {movements.isError && (
          <LoadError error={movements.error} onRetry={() => movements.refetch()} className="m-5" />
        )}
        {movements.data?.length === 0 && (
          <p className="px-5 py-6 type-body-sm text-ink-muted">{t('movementsEmpty')}</p>
        )}
        <ul className="flex flex-col divide-y divide-hairline">
          {movements.data?.slice(0, 40).map((movement) => {
            const Icon = ICON[movement.kind];
            const delta =
              movement.onHandDelta !== 0 ? movement.onHandDelta : movement.reservedDelta;
            return (
              <li key={movement.id} className="flex items-center gap-4 px-5 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-muted">
                  <Icon aria-hidden className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate type-body-sm text-ink">
                    <span className="font-medium">{t(`kinds.${movement.kind}`)}</span> ·{' '}
                    {movement.productName}
                    {movement.projectCode && (
                      <span className="font-mono text-ink-faint"> · {movement.projectCode}</span>
                    )}
                  </p>
                  <p className="truncate type-label text-ink-faint">
                    {[movement.locationName, movement.note, movement.by]
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    · {format.relativeTime(new Date(movement.at), now)}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 font-mono type-body-sm tabular-nums',
                    movement.onHandDelta > 0 && 'text-on-track',
                    movement.onHandDelta < 0 && 'text-ink',
                    movement.onHandDelta === 0 && 'text-ink-muted',
                  )}
                >
                  {signed(delta)} {movement.unit}
                  {movement.onHandDelta === 0 && ` ${t('held')}`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
