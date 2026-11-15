'use client';

import type { MarketingOverview } from '@oneohm/api-contracts';
import { Card } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { CountValue } from './count-value';

/** The last 30 days in four numbers that count up. */
export function TotalsStrip({ totals }: { readonly totals: MarketingOverview['totals'] }) {
  const t = useTranslations('marketing');
  const items = [
    { key: 'spent', value: totals.spentPaise > 0 ? totals.spentPaise : null, money: true },
    { key: 'leads', value: totals.leads > 0 ? totals.leads : null, money: false },
    { key: 'sales', value: totals.sales > 0 ? totals.sales : null, money: false },
    { key: 'costPerSale', value: totals.costPerSalePaise, money: true },
  ] as const;
  return (
    <Card tone="raised" aria-label={t('totals.title')} className="flex flex-col gap-3 p-4 sm:p-5">
      <p className="type-overline uppercase text-ink-faint">{t('totals.title')}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="flex flex-col gap-1">
            <dt className="type-body-sm text-ink-muted">{t(`numbers.${item.key}`)}</dt>
            <dd className="type-display-md text-ink tabular-nums">
              <CountValue value={item.value} money={item.money} />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
