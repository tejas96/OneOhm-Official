'use client';

import type { StockMovement } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  HardHat,
  Lock,
  type LucideIcon,
  SlidersHorizontal,
  Undo2,
  Unlock,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { formatQuantity } from '../use-inventory';

const ICON: Readonly<Record<StockMovement['kind'], LucideIcon>> = {
  receipt: ArrowDownToLine,
  reservation: Lock,
  release: Unlock,
  dispatch: ArrowUpFromLine,
  adjustment: SlidersHorizontal,
  issue: HardHat,
  return: Undo2,
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${formatQuantity(value)}`;

/** One ledger line: what changed, by how much, why and who. */
export function MovementRow({
  movement,
  now,
}: {
  readonly movement: StockMovement;
  readonly now: Date;
}) {
  const t = useTranslations('inventory.stock');
  const format = useFormatter();
  const Icon = ICON[movement.kind];
  const delta = movement.onHandDelta !== 0 ? movement.onHandDelta : movement.reservedDelta;
  return (
    <li className="flex items-center gap-4 px-5 py-3">
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
          {[movement.locationName, movement.note, movement.by].filter(Boolean).join(' · ')} ·{' '}
          {format.relativeTime(new Date(movement.at), now)}
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
}
