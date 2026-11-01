'use client';

import type { ReferralProgram, ReferralProgramInput } from '@oneohm/api-contracts';
import { Checkbox, Field, Input } from '@oneohm/design-system/web';
import { PROJECT_TYPES, type ProjectType } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { SettingsSection } from '../settings-section';

type Patch = (patch: Partial<ReferralProgramInput>) => void;

/** Which project types earn a reward, and the WhatsApp number friends message. */
export function EligibilitySection({
  draft,
  saved,
  onChange,
  errors,
}: {
  readonly draft: ReferralProgramInput;
  readonly saved: ReferralProgram;
  readonly onChange: Patch;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.referrals.eligibility');
  const typeT = useTranslations('settings.referrals.types');
  const toggle = (type: ProjectType, on: boolean) =>
    onChange({
      eligibleTypes: on
        ? PROJECT_TYPES.filter((value) => value === type || draft.eligibleTypes.includes(value))
        : draft.eligibleTypes.filter((value) => value !== type),
    });
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 type-label text-ink-muted">{t('types')}</legend>
        {PROJECT_TYPES.map((type) => (
          <Checkbox
            key={type}
            checked={draft.eligibleTypes.includes(type)}
            onCheckedChange={(on) => toggle(type, on)}
            label={typeT(type)}
          />
        ))}
        <p className="type-body-sm text-ink-faint">
          {draft.eligibleTypes.length === 0 ? t('allTypes') : t('someTypes')}
        </p>
        {errors.eligibleTypes && (
          <p className="type-body-sm text-overdue">{errors.eligibleTypes}</p>
        )}
      </fieldset>
      <Field
        label={t('shareNumber')}
        hint={
          saved.defaultShareNumber
            ? t('shareNumberHint', { number: saved.defaultShareNumber })
            : t('shareNumberNone')
        }
        error={errors.shareNumber}
        className="sm:max-w-sm"
      >
        <Input
          type="tel"
          inputMode="tel"
          value={draft.shareNumber ?? ''}
          onChange={(event) => onChange({ shareNumber: event.target.value || null })}
        />
      </Field>
    </SettingsSection>
  );
}
