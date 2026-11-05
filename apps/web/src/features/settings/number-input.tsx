'use client';

import { Input } from '@oneohm/design-system/web';
import { type ComponentPropsWithRef, useEffect, useState } from 'react';
import { type NumberUnit, readNumberText, toText } from './number-text';

interface NumberInputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'type'> {
  readonly value: number | null;
  readonly onValueChange: (value: number | null) => void;
  /** paise (shown as ₹), basisPoints (shown as %), watts (shown as kW), whole or decimal numbers. */
  readonly unit: NumberUnit;
}

/**
 * A number field that keeps integers in the model (paise, basis points) while people
 * type rupees and percentages. Partial input like "12." stays as typed; the value is
 * never negative, never NaN and never a fraction of a paise.
 */
export function NumberInput({ value, onValueChange, unit, ...props }: NumberInputProps) {
  const [text, setText] = useState(() => toText(value, unit));

  useEffect(() => {
    setText((current) =>
      readNumberText(current, unit).value === value ? current : toText(value, unit),
    );
  }, [value, unit]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      leading={unit === 'paise' ? <span className="text-[0.875rem]">₹</span> : undefined}
      trailing={
        unit === 'basisPoints' ? <span className="pr-1 text-[0.875rem]">%</span> : undefined
      }
      className="text-right font-mono tabular-nums"
      onChange={(event) => {
        // Letters, minus signs and extra decimals never get in; pasted "₹1,00,000.50" works.
        const next = readNumberText(event.target.value, unit);
        setText(next.text);
        onValueChange(next.value);
      }}
    />
  );
}
