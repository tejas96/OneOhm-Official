'use client';

import { Field, Input } from '@oneohm/design-system/web';
import { RUN_NUMBER_LIMITS, type RunNumberField, readRunNumber } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const show = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(Math.round(value * 100) / 100);

/**
 * One number of a cable run, typed freely. Text that is not a number, or is out of
 * range, gets a plain message under it; the price keeps the last number that was right.
 */
export function RunNumber({
  field,
  label,
  value,
  onChange,
}: {
  readonly field: RunNumberField;
  readonly label: string;
  readonly value: number | null | undefined;
  readonly onChange: (value: number) => void;
}) {
  const t = useTranslations('costing.detail.runCheck');
  const [text, setText] = useState(() => show(value));
  const reading = readRunNumber(field, text);
  useEffect(() => {
    setText((current) =>
      readRunNumber(field, current).value === (value ?? 0) ? current : show(value),
    );
  }, [field, value]);
  const limits = RUN_NUMBER_LIMITS[field];
  const error = reading.problem
    ? t(reading.problem === 'not_a_number' ? `notANumber.${field}` : reading.problem, {
        min: limits.min,
        max: limits.max.toLocaleString('en-IN'),
      })
    : undefined;
  return (
    <Field label={label} error={error} className="min-w-0">
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        trailing={
          limits.unit ? (
            <span className="pr-1 text-[0.8125rem] text-ink-faint">{limits.unit}</span>
          ) : undefined
        }
        className="text-right font-mono tabular-nums"
        onChange={(event) => {
          setText(event.target.value);
          const next = readRunNumber(field, event.target.value);
          if (next.value !== null) onChange(next.value);
        }}
      />
    </Field>
  );
}
