'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { useTranslations } from 'next-intl';

/** What earns points, as set in Settings, so nobody has to guess. */
export function PointsRules({ points }: { readonly points: WorkforcePolicyInput['points'] }) {
  const t = useTranslations('team.points.rules');
  const rules = [
    {
      key: 'onTime',
      label: t('onTime'),
      detail: t('onTimeDetail'),
      value: `+${points.onTimeTask}`,
    },
    {
      key: 'rating',
      label: t('rating'),
      detail: t('ratingDetail'),
      value: `+${points.goodRating}`,
    },
    {
      key: 'recognition',
      label: t('recognition'),
      detail: t('recognitionDetail'),
      value: t('upTo', { max: points.recognitionMax }),
    },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-hairline bg-raised px-5 py-4">
      <h2 className="type-title-md text-ink">{t('title')}</h2>
      <dl className="flex flex-col gap-3">
        {rules.map((rule) => (
          <div key={rule.key} className="flex flex-col gap-0.5 border-l-2 border-hairline pl-3">
            <dt className="flex items-baseline justify-between gap-3 type-body-sm font-medium text-ink">
              {rule.label}
              <span className="shrink-0 type-body-sm font-normal text-ink-muted tabular-nums">
                {rule.value}
              </span>
            </dt>
            <dd className="type-body-sm text-ink-faint">{rule.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
