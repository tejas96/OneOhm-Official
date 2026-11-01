'use client';

import { Input } from '@oneohm/design-system/web';
import { type ComponentPropsWithRef, useEffect, useState } from 'react';

type Unit = 'paise' | 'basisPoints' | 'whole';

/** Stored value → what the person types: paise as rupees, basis points as percent. */
const SCALE: Readonly<Record<Unit, number>> = { paise: 100, basisPoints: 100, whole: 1 };

function toText(value: number | null, unit: Unit): string {
  if (value === null) return '';
  const shown = value / SCALE[unit];
  return Number.isInteger(shown) ? String(shown) : shown.toFixed(2).replace(/0$/, '');
}

function fromText(text: string, unit: Unit): number | null | undefined {
  const cleaned = text.replace(/[,\s₹%]/g, '');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed * SCALE[unit]);
}

interface NumberInputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'type'> {
  readonly value: number | null;
  readonly onValueChange: (value: number | null) => void;
  /** paise (shown as ₹), basisPoints (shown as %), or whole numbers. */
  readonly unit: Unit;
}

/**
 * A number field that keeps integers in the model (paise, basis points) while people
 * type rupees and percentages. Partial input like "12." stays as typed.
 */
export function NumberInput({ value, onValueChange, unit, ...props }: NumberInputProps) {
  const [text, setText] = useState(() => toText(value, unit));

  useEffect(() => {
    setText((current) => (fromText(current, unit) === value ? current : toText(value, unit)));
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
        setText(event.target.value);
        const parsed = fromText(event.target.value, unit);
        if (parsed !== undefined) onValueChange(parsed);
      }}
    />
  );
}
