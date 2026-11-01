'use client';

import type { WorkOrderDetail } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * The money on the ocean panel: gross, what comes off (rework, retention, TDS,
 * advances), and the net payable — a preview until the work order settles.
 */
export function WorkOrderSettlement({ order }: { readonly order: WorkOrderDetail }) {
  const t = useTranslations('contractors.settlement');
  const format = useFormatter();
  const s = order.settlement;
  const settled = order.status === 'completed';
  const less = [
    { key: 'rework', value: s.reworkDeductionsPaise },
    { key: 'retention', value: s.retentionPaise },
    { key: 'tds', value: s.tdsPaise },
    { key: 'advances', value: s.advancesPaise },
  ] as const;
  const payable = (ref: WorkOrderDetail['payable'], label: string) =>
    ref && (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-on-panel/8 px-4 py-3">
        <span className="flex flex-col">
          <span className="type-body-sm text-on-panel">{label}</span>
          <span className="type-label text-on-panel-muted">
            {t('dueOn', {
              date: format.dateTime(new Date(ref.dueOn), {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
            })}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="type-body-sm text-on-panel tabular-nums">
            {formatInr(ref.amountPaise)}
          </span>
          <StatusPill
            size="sm"
            tone={ref.status === 'paid' ? 'done' : 'waiting'}
            label={t(`payable.${ref.status}`)}
          />
        </span>
      </div>
    );

  return (
    <section className="oh-panel flex flex-col gap-5 rounded-[28px] p-6 shadow-e3">
      <div className="flex flex-col gap-1">
        <p className="type-overline text-on-panel-muted uppercase">
          {settled ? t('settled') : t('preview')}
        </p>
        <p className="type-display-xl text-on-panel tabular-nums">{formatInr(s.netPayablePaise)}</p>
        <p className="type-body-sm text-on-panel-muted">{t('netHint')}</p>
      </div>
      <dl className="flex flex-col">
        <Row label={t('gross')} value={formatInr(s.grossPaise)} strong />
        {less.map((item) => (
          <Row
            key={item.key}
            label={t(item.key)}
            value={item.value ? `− ${formatInr(item.value)}` : '—'}
          />
        ))}
      </dl>
      {payable(order.payable, t('payableNet'))}
      {payable(order.retentionPayable, t('payableRetention'))}
      {order.rework.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="type-overline text-on-panel-muted uppercase">{t('reworkLog')}</p>
          <ul className="flex flex-col gap-1.5">
            {order.rework.map((item) => (
              <li key={item.id} className="type-body-sm text-on-panel">
                {item.note}
                {item.deductionPaise > 0 && (
                  <span className="text-on-panel-muted"> · − {formatInr(item.deductionPaise)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {order.advances.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="type-overline text-on-panel-muted uppercase">{t('advanceLog')}</p>
          <ul className="flex flex-col gap-1.5">
            {order.advances.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 type-body-sm text-on-panel">
                <span>{item.note ?? t('advance')}</span>
                <span className="tabular-nums">
                  {formatInr(item.amountPaise)} · {t(`payable.${item.payableStatus}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 py-2">
      <dt className="type-body-sm text-on-panel-muted">{label}</dt>
      <span aria-hidden className="flex-1 border-b border-dotted border-on-panel/25" />
      <dd
        className={
          strong
            ? 'type-title-md text-on-panel tabular-nums'
            : 'type-body-sm text-on-panel tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  );
}
