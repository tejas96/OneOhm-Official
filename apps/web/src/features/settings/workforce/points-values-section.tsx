'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';

type Points = WorkforcePolicyInput['points'];
const FIELDS = ['onTimeTask', 'goodRating', 'recognitionMax'] as const;

/** How many points each kind of good work is worth. */
export function PointsValuesSection({
  points,
  onChange,
  errors,
}: {
  readonly points: Points;
  readonly onChange: (points: Points) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.workforce.points');
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <Field
            key={field}
            label={t(field)}
            hint={t(`${field}Hint`)}
            error={errors[`points.${field}`]}
          >
            <NumberInput
              unit="whole"
              value={points[field]}
              onValueChange={(value) => onChange({ ...points, [field]: value ?? 0 })}
            />
          </Field>
        ))}
      </div>
    </SettingsSection>
  );
}
