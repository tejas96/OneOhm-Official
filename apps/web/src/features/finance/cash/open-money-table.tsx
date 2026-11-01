'use client';

import type { HandledPayment } from '@oneohm/api-contracts';
import {
  Button,
  Checkbox,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Check, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const TONE: Readonly<Record<HandledPayment['status'], PillTone>> = {
  in_hand: 'waiting',
  deposited: 'review',
  cleared: 'done',
  bounced: 'overdue',
};

/** Cash and cheques not yet in the bank, oldest first; tick money in hand to deposit it. */
export function OpenMoneyTable({
  rows,
  alertDays,
  picked,
  onToggle,
  canRecord,
  canBounce,
  onClear,
  onBounce,
}: {
  readonly rows: readonly HandledPayment[];
  readonly alertDays: number;
  readonly picked: ReadonlySet<string>;
  readonly onToggle: ((row: HandledPayment) => void) | null;
  readonly canRecord: boolean;
  readonly canBounce: boolean;
  readonly onClear: (row: HandledPayment) => void;
  readonly onBounce: (row: HandledPayment) => void;
}) {
  const t = useTranslations('finance.cash');
  const late = (row: HandledPayment) =>
    row.method === 'cash' && row.status === 'in_hand' && row.daysHeld > alertDays;
  const columns: TableColumn<HandledPayment>[] = [
    {
      key: 'from',
      header: t('columns.from'),
      primary: true,
      cell: (row) => (
        <span className="flex items-start gap-3">
          {onToggle && row.status === 'in_hand' && (
            <Checkbox
              checked={picked.has(row.paymentId)}
              onCheckedChange={() => onToggle(row)}
              label={t('pick', { from: row.customer })}
              hideLabel
            />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="type-body font-medium text-ink">{row.customer}</span>
            <span className="font-mono text-[0.75rem] text-ink-faint">
              {[row.projectCode, row.receiptNumber].filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'method',
      header: t('columns.method'),
      cell: (row) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink">{t(`method.${row.method}`)}</span>
          {row.method === 'cheque' && (
            <span className="text-ink-faint">
              {[row.chequeNumber, row.chequeBank].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (row) => (
        <span className="font-mono text-ink tabular-nums">{formatInr(row.amountPaise)}</span>
      ),
    },
    {
      key: 'holder',
      header: t('columns.holder'),
      cell: (row) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink">{row.collectedBy?.name ?? t('unknownHolder')}</span>
          <span className={late(row) ? 'text-overdue' : 'text-ink-faint'}>
            {t('held', { days: row.daysHeld })}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill
            size="sm"
            tone={late(row) ? 'overdue' : TONE[row.status]}
            label={
              row.depositNumber
                ? t('depositedOn', { number: row.depositNumber })
                : t(`status.${row.status}`)
            }
          />
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      cell: (row) =>
        row.method === 'cheque' && (canRecord || canBounce) ? (
          <span className="flex flex-wrap items-center gap-2">
            {canRecord && (
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<Check />}
                onClick={() => onClear(row)}
              >
                {t('cheque.clear')}
              </Button>
            )}
            {canBounce && (
              <Button
                size="sm"
                variant="quiet"
                leadingIcon={<Undo2 />}
                onClick={() => onBounce(row)}
              >
                {t('cheque.bounce')}
              </Button>
            )}
          </span>
        ) : null,
    },
  ];
  return (
    <ResponsiveTable
      caption={t('openCaption')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.paymentId}
    />
  );
}
