'use client';

import { useCountUp } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';

/** A number that counts up when it arrives or changes; a dash when there is none yet. */
export function CountValue({
  value,
  money = false,
  className,
}: {
  readonly value: number | null;
  readonly money?: boolean;
  readonly className?: string;
}) {
  const shown = useCountUp(value ?? 0);
  if (value === null) return <span className={className}>—</span>;
  const text = money ? formatInr(Math.round(shown)) : Math.round(shown).toLocaleString('en-IN');
  const final = money ? formatInr(value) : value.toLocaleString('en-IN');
  return (
    <span className={className}>
      <span aria-hidden>{text}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
