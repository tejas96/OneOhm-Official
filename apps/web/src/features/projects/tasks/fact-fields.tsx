'use client';

import { Field, Input, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

const NUMERIC = new Set([
  'site_floors',
  'dc_cable_meters',
  'ac_cable_meters',
  'sanctioned_capacity_kw',
  'module_wattage',
  'module_count',
  'earthing_resistance',
  'installed_capacity_kw',
  'inverter_total_kw',
  'module_total_kw',
  'module_efficiency',
]);
const LONG = new Set(['module_serial_numbers', 'site_address']);

/** A readable name for a fact key, from the messages when known. */
export function useFactLabel() {
  const t = useTranslations('projects.facts');
  return (key: string) =>
    t.has(key) ? t(key) : key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** The inputs for the facts a task records, pre-filled with what the project already knows. */
export function FactFields({
  keys,
  values,
  errors,
  onChange,
}: {
  readonly keys: readonly string[];
  readonly values: Readonly<Record<string, string>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (key: string, value: string) => void;
}) {
  const t = useTranslations('projects.complete');
  const label = useFactLabel();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {keys.map((key) => {
        const common = {
          name: key,
          value: values[key] ?? '',
          onChange: (event: { target: { value: string } }) => onChange(key, event.target.value),
        };
        return (
          <Field
            key={key}
            label={label(key)}
            required
            error={errors[key]}
            {...(LONG.has(key) ? { className: 'sm:col-span-2' } : {})}
            {...(key === 'module_serial_numbers' ? { hint: t('serialHint') } : {})}
          >
            {LONG.has(key) ? (
              <Textarea rows={3} {...common} />
            ) : (
              <Input
                {...common}
                type={key.endsWith('_date') ? 'date' : 'text'}
                {...(NUMERIC.has(key) ? { inputMode: 'decimal' as const } : {})}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
