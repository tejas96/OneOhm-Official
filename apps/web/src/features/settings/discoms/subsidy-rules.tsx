'use client';

import type { SubsidyRuleView } from '@oneohm/api-contracts';
import { formatInr, formatKwp } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useSubsidyRules } from '../use-settings';

/** PM Surya Ghar rules as the price engine applies them; read-only here. */
export function SubsidyRules() {
  const t = useTranslations('settings.subsidy');
  const rules = useSubsidyRules();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-display-md text-ink">{t('title')}</h2>
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      </div>
      {rules.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {rules.isError && <LoadError error={rules.error} onRetry={() => rules.refetch()} />}
      {rules.data && (
        <ul className="grid gap-3 lg:grid-cols-3">
          {rules.data.map((rule) => (
            <li key={rule.id}>
              <RuleCard rule={rule} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RuleCard({ rule }: { readonly rule: SubsidyRuleView }) {
  const t = useTranslations('settings.subsidy');
  const format = useFormatter();
  const paying = rule.slabs.filter((slab) => slab.paisePerKw > 0);
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl bg-raised p-5 shadow-e1 ring-1 ring-hairline/70">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="type-title-lg font-normal text-ink [font-family:var(--font-display)]">
          {t(`categories.${rule.category}`)}
        </h3>
        <p className="font-mono text-[0.75rem] text-ink-faint">
          {t('validFrom', {
            date: format.dateTime(new Date(rule.validFrom), { dateStyle: 'medium' }),
          })}
        </p>
      </header>
      {paying.length === 0 ? (
        <p className="type-body text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 type-body-sm text-ink-muted">
          {paying.map((slab) => (
            <li key={slab.fromWp}>
              {slab.toWp === null && slab.fromWp === 0
                ? t('slabAll', { rate: formatInr(slab.paisePerKw) })
                : slab.toWp === null
                  ? t('slabOpen', {
                      from: formatKwp(slab.fromWp),
                      rate: formatInr(slab.paisePerKw),
                    })
                  : t('slab', {
                      from: formatKwp(slab.fromWp),
                      to: formatKwp(slab.toWp),
                      rate: formatInr(slab.paisePerKw),
                    })}
            </li>
          ))}
          {rule.perHouseholdWp !== null && (
            <li>{t('perHousehold', { capacity: formatKwp(rule.perHouseholdWp) })}</li>
          )}
          {rule.maxEligibleWp !== null && (
            <li>{t('maxEligible', { capacity: formatKwp(rule.maxEligibleWp) })}</li>
          )}
        </ul>
      )}
      {paying.length > 0 && (
        <p className="mt-auto border-t border-hairline pt-3 type-body-sm font-medium text-ink">
          {t('cap', { amount: formatInr(rule.capPaise) })}
        </p>
      )}
    </article>
  );
}
