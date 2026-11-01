'use client';

import { Input } from '@oneohm/design-system/web';
import { type ComponentPropsWithRef, useEffect, useState } from 'react';

const WP_PER_KW = 1000;

function toText(wattsPeak: number | null): string {
  if (wattsPeak === null) return '';
  return String(Number((wattsPeak / WP_PER_KW).toFixed(3)));
}

/** Typed kW → stored Wp; undefined while the text is not a number yet. */
function fromText(text: string): number | null | undefined {
  const cleaned = text.replace(/[,\s]|kw/gi, '');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * WP_PER_KW) : undefined;
}

interface KwInputProps extends Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'type'> {
  /** Watts-peak, as stored. */
  readonly value: number | null;
  readonly onValueChange: (wattsPeak: number | null) => void;
}

/** Capacity typed in kW (2.5) and kept in Wp (2500); partial input like "2." stays as typed. */
export function KwInput({ value, onValueChange, ...props }: KwInputProps) {
  const [text, setText] = useState(() => toText(value));

  useEffect(() => {
    setText((current) => (fromText(current) === value ? current : toText(value)));
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      trailing={<span className="pr-1 text-[0.875rem]">kW</span>}
      className="text-right font-mono tabular-nums"
      onChange={(event) => {
        setText(event.target.value);
        const parsed = fromText(event.target.value);
        if (parsed !== undefined) onValueChange(parsed);
      }}
    />
  );
}
