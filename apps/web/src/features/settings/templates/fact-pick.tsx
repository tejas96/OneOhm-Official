'use client';

import { Field, IconButton, Select } from '@oneohm/design-system/web';
import { factLabel, KNOWN_FACT_KEYS } from '@oneohm/domain';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The details a task records, picked by name. Picked ones show as chips in the order
 * chosen; one saved earlier that OneOhm no longer lists still shows, by a readable name.
 */
export function FactPick({
  value,
  onChange,
  error,
}: {
  readonly value: readonly string[];
  readonly onChange: (keys: string[]) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('settings.taskTemplates.sheet');
  const options = KNOWN_FACT_KEYS.filter((key) => !value.includes(key)).map((key) => ({
    value: key,
    label: factLabel(key),
  }));
  return (
    <Field label={t('captures')} hint={t('capturesHint')} error={error}>
      {value.length > 0 ? (
        <ul aria-label={t('capturesPicked')} className="flex flex-wrap gap-2">
          {value.map((key) => (
            <li
              key={key}
              className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-md border border-hairline bg-sunken/60 pl-3 type-body-sm text-ink"
            >
              <span className="min-w-0 truncate">{factLabel(key)}</span>
              <IconButton
                size="sm"
                label={t('removeFact', { label: factLabel(key) })}
                onClick={() => onChange(value.filter((item) => item !== key))}
              >
                <X />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body-sm text-ink-faint">{t('capturesNone')}</p>
      )}
      {options.length > 0 && (
        <Select<string>
          value=""
          placeholder={t('addFact')}
          options={options}
          onValueChange={(key) => onChange([...value, key])}
          className="sm:max-w-sm"
        />
      )}
    </Field>
  );
}
