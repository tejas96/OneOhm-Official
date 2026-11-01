import type { Discom } from '@oneohm/api-contracts';
import { ChoiceChips, Field } from '@oneohm/mobile-ui';
import { DISCOM } from '@/copy/capture';

/**
 * The DISCOM as a row of short codes (MSEDCL, TATA …); the full name of the picked one
 * reads underneath, so the person can match it to the bill.
 */
export function DiscomPicker({
  discoms,
  value,
  onChange,
  optional,
  error,
}: {
  readonly discoms: readonly Discom[];
  readonly value: string | null;
  readonly onChange: (discomId: string) => void;
  readonly optional?: string | undefined;
  readonly error?: string | undefined;
}) {
  const picked = discoms.find((discom) => discom.id === value);
  return (
    <Field
      label={DISCOM.label}
      hint={picked?.name ?? DISCOM.hint}
      optional={optional}
      error={error}
    >
      <ChoiceChips
        label={DISCOM.label}
        choices={discoms.map((discom) => ({ value: discom.id, label: discom.code }))}
        value={value}
        onChange={onChange}
      />
    </Field>
  );
}
