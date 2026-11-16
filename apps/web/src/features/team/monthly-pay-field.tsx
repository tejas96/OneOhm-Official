'use client';

import { Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/features/settings/number-input';

/** What the person is paid for a full month; the month sheet turns it into a gross figure. */
export function MonthlyPayField({
  value,
  onChange,
  error,
}: {
  readonly value: number | null;
  readonly onChange: (paise: number | null) => void;
  readonly error: string | undefined;
}) {
  const t = useTranslations('team.editSheet.pay');
  return (
    <Field label={t('label')} hint={t('hint')} error={error} className="max-w-xs">
      <NumberInput unit="paise" value={value} onValueChange={onChange} />
    </Field>
  );
}
