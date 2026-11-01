'use client';

import type { FactFieldInfo } from '@oneohm/api-contracts';
import { Field, Input, Textarea } from '@oneohm/design-system/web';

/**
 * The inputs for the facts a task records. Labels, input kinds and hints come with the
 * task from the API (one list shared with the field app and the API's own errors).
 */
export function FactFields({
  fields,
  values,
  errors,
  onChange,
}: {
  readonly fields: readonly FactFieldInfo[];
  readonly values: Readonly<Record<string, string>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const common = {
          name: field.key,
          value: values[field.key] ?? '',
          onChange: (event: { target: { value: string } }) =>
            onChange(field.key, event.target.value),
        };
        const long = field.input === 'long';
        return (
          <Field
            key={field.key}
            label={field.label}
            required
            error={errors[field.key]}
            {...(long ? { className: 'sm:col-span-2' } : {})}
            {...(field.hint ? { hint: field.hint } : {})}
          >
            {long ? (
              <Textarea rows={3} {...common} />
            ) : (
              <Input
                {...common}
                type={field.input === 'date' ? 'date' : 'text'}
                {...(field.input === 'number' ? { inputMode: 'decimal' as const } : {})}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
