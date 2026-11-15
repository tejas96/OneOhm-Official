'use client';

import type { CampaignDetail } from '@oneohm/api-contracts';
import { Sparkline } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { CountValue } from './count-value';
import { cardNumbers } from './marketing-words';

/** The four numbers big, with a line each for daily spend and daily leads. */
export function DetailNumbers({ detail }: { readonly detail: CampaignDetail }) {
  const t = useTranslations('marketing');
  const spend = detail.days.map((day) => day.spentPaise);
  const leads = detail.days.map((day) => day.leads);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3">
        {cardNumbers(detail.numbers).map((number) => (
          <div
            key={number.key}
            className="flex flex-col gap-1 rounded-xl border border-hairline bg-raised p-3"
          >
            <dt className="type-body-sm text-ink-muted">{t(`numbers.${number.key}`)}</dt>
            <dd className="type-display-md text-ink tabular-nums">
              <CountValue value={number.value} money={number.money} />
            </dd>
          </div>
        ))}
      </dl>
      {detail.days.length >= 2 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-raised p-3">
            <p className="type-body-sm text-ink-muted">{t('detail.spendDaily')}</p>
            <Sparkline values={spend} label={t('detail.spendDaily')} />
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-raised p-3">
            <p className="type-body-sm text-ink-muted">{t('detail.leadsDaily')}</p>
            <Sparkline values={leads} label={t('detail.leadsDaily')} />
          </div>
        </div>
      ) : (
        <p className="type-body-sm text-ink-muted">{t('detail.noDays')}</p>
      )}
    </div>
  );
}
