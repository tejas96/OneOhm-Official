'use client';

import { cn, Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { NumberInput } from '../number-input';

export interface PricePair {
  readonly price: number;
  readonly cost: number;
}

export type Errors = Readonly<Record<string, string>>;

const ROW = 'grid gap-3 border-b border-hairline py-3 last:border-b-0 sm:items-center';

/** Price and cost side by side, with the margin they leave. */
export function PairRow({
  label,
  path,
  value,
  onChange,
  errors,
}: {
  readonly label: string;
  readonly path: string;
  readonly value: PricePair;
  readonly onChange: (next: PricePair) => void;
  readonly errors: Errors;
}) {
  const t = useTranslations('settings.rates');
  const margin = value.price > 0 ? ((value.price - value.cost) / value.price) * 100 : null;
  return (
    <div className={cn(ROW, 'sm:grid-cols-[minmax(0,1fr)_9rem_9rem_4rem]')}>
      <p className="type-body text-ink">{label}</p>
      <Field label={t('price')} hideLabel error={errors[`${path}.price`]}>
        <NumberInput
          unit="paise"
          aria-label={`${label}: ${t('price')}`}
          value={value.price}
          onValueChange={(price) => onChange({ ...value, price: price ?? 0 })}
        />
      </Field>
      <Field label={t('cost')} hideLabel error={errors[`${path}.cost`]}>
        <NumberInput
          unit="paise"
          aria-label={`${label}: ${t('cost')}`}
          value={value.cost}
          onValueChange={(cost) => onChange({ ...value, cost: cost ?? 0 })}
        />
      </Field>
      <p className="text-right font-mono text-[0.8125rem] text-ink-faint">
        {margin === null ? '—' : `${margin.toFixed(0)}%`}
      </p>
    </div>
  );
}

/** Column headings over a group of price rows. */
export function PairHeader() {
  const t = useTranslations('settings.rates');
  return (
    <div
      aria-hidden
      className="hidden gap-3 border-b border-hairline pb-2 type-label text-ink-faint sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_9rem_4rem]"
    >
      <span />
      <span className="text-right">{t('price')}</span>
      <span className="text-right">{t('cost')}</span>
      <span className="text-right">{t('margin')}</span>
    </div>
  );
}

/** One labelled number with an optional hint, for counts, distances and percentages. */
export function ValueRow({
  label,
  hint,
  unit,
  value,
  onChange,
  error,
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly unit: 'paise' | 'basisPoints' | 'whole';
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly error?: string | undefined;
}) {
  return (
    <div className={cn(ROW, 'sm:grid-cols-[minmax(0,1fr)_9rem]')}>
      <div className="flex flex-col gap-0.5">
        <p className="type-body text-ink">{label}</p>
        {hint && <p className="type-body-sm text-ink-faint">{hint}</p>}
      </div>
      <Field label={label} hideLabel error={error}>
        <NumberInput
          unit={unit}
          aria-label={label}
          value={value}
          onValueChange={(next) => onChange(next ?? 0)}
        />
      </Field>
    </div>
  );
}

export function RowGroup({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}
