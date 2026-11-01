'use client';

import { cn, Field } from '@oneohm/design-system/web';
import type { ReactNode } from 'react';
import { NumberInput } from '../number-input';

const ROW = 'grid gap-3 border-b border-hairline py-3 last:border-b-0 sm:items-center';

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
