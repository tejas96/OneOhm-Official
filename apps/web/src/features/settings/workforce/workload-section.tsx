'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';

type Capacity = WorkforcePolicyInput['capacity'];

/** How many open tasks one person should carry (PRD 3.12); people can have their own. */
export function WorkloadSection({
  capacity,
  onChange,
  errors,
}: {
  readonly capacity: Capacity;
  readonly onChange: (capacity: Capacity) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.workforce.workload');
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <Field
        label={t('limit')}
        hint={t('limitHint')}
        error={errors['capacity.defaultOpenTaskLimit']}
        className="max-w-xs"
      >
        <NumberInput
          unit="whole"
          value={capacity.defaultOpenTaskLimit}
          onValueChange={(value) => onChange({ defaultOpenTaskLimit: value ?? 0 })}
        />
      </Field>
    </SettingsSection>
  );
}
