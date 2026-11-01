'use client';

import { Input } from '@oneohm/design-system/web';
import { type ComponentPropsWithRef, useEffect, useState } from 'react';

const parse = (text: string): number | null | undefined => {
  const cleaned = text.replace(/[,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

const show = (value: number | null, decimals: number) =>
  value === null ? '' : String(Math.round(value * 10 ** decimals) / 10 ** decimals);

/** A plain number that may have decimals (metres, quantities, days); half-typed "2." stays. */
export function DecimalInput({
  value,
  onValueChange,
  suffix,
  decimals = 2,
  ...props
}: Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'type'> & {
  readonly value: number | null;
  readonly onValueChange: (value: number | null) => void;
  readonly suffix?: string | undefined;
  /** Places shown when the value comes from outside; 6 for coordinates. */
  readonly decimals?: number;
}) {
  const [text, setText] = useState(() => show(value, decimals));
  useEffect(() => {
    setText((current) => (parse(current) === value ? current : show(value, decimals)));
  }, [value, decimals]);
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      trailing={
        suffix ? <span className="pr-1 text-[0.8125rem] text-ink-faint">{suffix}</span> : undefined
      }
      className="text-right font-mono tabular-nums"
      onChange={(event) => {
        setText(event.target.value);
        const parsed = parse(event.target.value);
        if (parsed !== undefined) onValueChange(parsed);
      }}
    />
  );
}
