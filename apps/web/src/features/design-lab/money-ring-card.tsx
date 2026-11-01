'use client';

import { Card, CardHeader, cn, ProgressRing } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { MONEY } from './lab-data';

/** Collections against what is due this month, then the money still moving. */
export function MoneyRingCard({ className }: { readonly className?: string }) {
  const t = useTranslations('lab.money');
  const share = MONEY.collected / MONEY.due;
  const rows = [
    { key: 'stillDue', value: MONEY.stillDue, dot: 'bg-accent' },
    { key: 'bankPending', value: MONEY.receivables.bank, dot: 'bg-party-bank' },
    {
      key: 'payThisWeek',
      value: MONEY.payables.vendors + MONEY.payables.contractors,
      dot: 'bg-swatch-3',
    },
  ] as const;
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={t('title')} description={t('description')} />
      <div className="flex flex-col items-center gap-6 px-5 pb-5">
        <ProgressRing
          value={share}
          label={t('ringAria', { percent: Math.round(share * 100) })}
          size={188}
          thickness={14}
          paint="brand"
          trackClassName="stroke-sunken"
        >
          <span className="type-display-md text-ink tabular-nums">
            {formatInrCompact(MONEY.collected)}
          </span>
          <span className="mt-1.5 type-label text-ink-faint">
            {t('ofDue', { due: formatInrCompact(MONEY.due) })}
          </span>
        </ProgressRing>
        <dl className="flex w-full flex-col divide-y divide-hairline border-t border-hairline">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="inline-flex items-center gap-2 type-body-sm text-ink-muted">
                <span aria-hidden className={cn('size-2 rounded-full', row.dot)} />
                {t(row.key)}
              </dt>
              <dd className="font-mono text-[0.875rem] text-ink tabular-nums">
                {formatInrCompact(row.value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
