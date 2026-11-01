'use client';

import type { QuotationCosting } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';

type Build = NonNullable<QuotationCosting['build']>;

const PARTS = [
  'materialPaise',
  'labourPaise',
  'equipmentPaise',
  'travelPaise',
  'servicesPaise',
] as const;

function Row({
  label,
  value,
  strong = false,
  muted = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
  readonly muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-1.5',
        strong && 'border-t border-hairline pt-2.5',
      )}
    >
      <dt
        className={cn(
          'type-body-sm',
          muted ? 'text-ink-faint' : 'text-ink-muted',
          strong && 'font-medium text-ink',
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'tabular-nums type-body-sm',
          strong ? 'font-medium text-ink' : 'text-ink-muted',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * How the price was reached (PRD 3.9 D, for people who see cost): material, labour,
 * equipment, travel and services make the direct cost; overhead goes on top; the price
 * before GST less all of it is the margin.
 */
export function CostBuildup({
  costing,
  className,
}: {
  readonly costing: QuotationCosting;
  readonly className?: string;
}) {
  const t = useTranslations('costing.buildup');
  const build: Build | undefined = costing.build;
  if (!build) return null;
  const percent = (bp: number) => `${(bp / 100).toFixed(1)}%`;
  return (
    <section
      aria-label={t('title')}
      className={cn(
        'flex flex-col gap-2 rounded-2xl border border-hairline bg-raised p-5',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h4 className="type-overline text-accent uppercase">{t('title')}</h4>
        <p className="type-body-sm text-ink-faint">{t(`modes.${costing.pricingMode}`)}</p>
      </div>
      <dl className="flex flex-col">
        {PARTS.filter((part) => build[part] !== 0).map((part) => (
          <Row key={part} label={t(`parts.${part}`)} value={formatInr(build[part])} />
        ))}
        <Row label={t('direct')} value={formatInr(build.directCostPaise)} strong />
        <Row label={t('overhead')} value={formatInr(build.overheadPaise)} muted />
        <Row label={t('fullCost')} value={formatInr(build.fullCostPaise)} strong />
        <Row label={t('netPrice')} value={formatInr(build.netPricePaise)} />
        <Row
          label={t('margin', { percent: percent(build.marginBp) })}
          value={formatInr(build.marginPaise)}
          strong
        />
      </dl>
    </section>
  );
}
