'use client';

import { Select } from '@oneohm/design-system/web';
import { UNIT_LABELS, UNITS, type Unit } from '@oneohm/domain';

const OPTIONS = UNITS.map((value) => ({ value, label: UNIT_LABELS[value] }));

/** The unit a quantity is counted in, picked from the fixed list (never typed). */
export function UnitSelect({
  value,
  onValueChange,
  label,
  disabled,
}: {
  readonly value: Unit;
  readonly onValueChange: (unit: Unit) => void;
  readonly label: string;
  readonly disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as Unit)}
      options={OPTIONS}
      label={label}
      {...(disabled ? { disabled } : {})}
    />
  );
}
