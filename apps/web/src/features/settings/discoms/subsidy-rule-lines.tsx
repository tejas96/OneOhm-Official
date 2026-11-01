'use client';

import type { SubsidyRuleView } from '@oneohm/api-contracts';
import { formatInr, formatKwp } from '@oneohm/shared';
import { useTranslations } from 'next-intl';

type Slab = SubsidyRuleView['slabs'][number];

/** One rule in words: each paying slab, the society limits, then the cap. */
export function SubsidyRuleLines({ rule }: { readonly rule: SubsidyRuleView }) {
  const t = useTranslations('settings.subsidy');
  const paying = rule.slabs.filter((slab) => slab.paisePerKw > 0);
  const line = (slab: Slab) => {
    const rate = formatInr(slab.paisePerKw);
    if (slab.toWp === null && slab.fromWp === 0) return t('slabAll', { rate });
    if (slab.toWp === null) return t('slabOpen', { from: formatKwp(slab.fromWp), rate });
    return t('slab', { from: formatKwp(slab.fromWp), to: formatKwp(slab.toWp), rate });
  };
  if (paying.length === 0) return <p className="type-body text-ink-muted">{t('none')}</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5 type-body-sm text-ink-muted">
        {paying.map((slab) => (
          <li key={slab.fromWp}>{line(slab)}</li>
        ))}
        {rule.perHouseholdWp !== null && (
          <li>{t('perHousehold', { capacity: formatKwp(rule.perHouseholdWp) })}</li>
        )}
        {rule.maxEligibleWp !== null && (
          <li>{t('maxEligible', { capacity: formatKwp(rule.maxEligibleWp) })}</li>
        )}
      </ul>
      <p className="type-body-sm font-medium text-ink">
        {t('cap', { amount: formatInr(rule.capPaise) })}
      </p>
    </div>
  );
}
