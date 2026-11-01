'use client';

import { Button, cn, IconButton, Select } from '@oneohm/design-system/web';
import type { RateKind } from '@oneohm/domain';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DecimalInput } from './decimal-input';

export interface RateOption {
  readonly key: string;
  readonly label: string;
  readonly kind: RateKind;
  readonly unit: string;
}

/** Picks one rate line of the given kinds, by its name and unit. */
export function RateSelect({
  rates,
  kinds,
  value,
  onChange,
  label,
  wide = false,
}: {
  readonly rates: readonly RateOption[];
  readonly kinds: readonly RateKind[];
  readonly value: string;
  readonly onChange: (key: string) => void;
  readonly label: string;
  /** Two columns wide on every screen, for rows with many fields. */
  readonly wide?: boolean;
}) {
  const options = rates
    .filter((rate) => kinds.includes(rate.kind) || rate.key === value)
    .map((rate) => ({ value: rate.key, label: `${rate.label} · ${rate.unit}` }));
  return (
    <div className={cn('col-span-2 flex min-w-0 flex-col gap-1', !wide && 'sm:col-span-1')}>
      <span className="truncate type-label text-ink-faint">{label}</span>
      <Select
        label={label}
        value={value || undefined}
        onValueChange={onChange}
        options={options}
        className="w-full min-w-0 [&>span]:truncate"
      />
    </div>
  );
}

/** A small number with a label above it, for quantities inside a row. */
export function SmallNumber({
  label,
  value,
  onChange,
  suffix,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly suffix?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span aria-hidden className="truncate type-label text-ink-faint">
        {label}
      </span>
      <DecimalInput
        aria-label={label}
        value={value}
        suffix={suffix}
        onValueChange={(next) => onChange(next ?? 0)}
      />
    </div>
  );
}

/**
 * Rows of a list with a remove button each and an add button below: structure parts,
 * cable routes, crew and equipment, in Settings and in a quotation's detail.
 */
export function ListEditor<T>({
  items,
  onChange,
  blank,
  addLabel,
  emptyLabel,
  columns,
  children,
}: {
  readonly items: readonly T[];
  readonly onChange: (items: T[]) => void;
  readonly blank: () => T;
  readonly addLabel: string;
  readonly emptyLabel: string;
  /** Tailwind grid columns for the row's fields on wide screens. */
  readonly columns: string;
  readonly children: (item: T, update: (next: T) => void, index: number) => ReactNode;
}) {
  const t = useTranslations('costing.common');
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <p className="type-body-sm text-ink-faint">{emptyLabel}</p>}
      {items.map((item, index) => (
        <div
          // Rows have no identity of their own; position is what people edit.
          key={index}
          className="flex items-end gap-2 border-b border-hairline pb-3 last:border-b-0"
        >
          <div className={cn('grid min-w-0 flex-1 grid-cols-2 gap-3', columns)}>
            {children(
              item,
              (next) => onChange(items.map((entry, at) => (at === index ? next : entry))),
              index,
            )}
          </div>
          <IconButton
            label={t('remove')}
            onClick={() => onChange(items.filter((_, at) => at !== index))}
          >
            <Trash2 />
          </IconButton>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<Plus />}
        onClick={() => onChange([...items, blank()])}
        className="self-start"
      >
        {addLabel}
      </Button>
    </div>
  );
}
