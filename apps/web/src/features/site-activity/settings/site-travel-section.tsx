'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/features/settings/number-input';
import { SettingsSection } from '@/features/settings/settings-section';

type Travel = WorkforcePolicyInput['travel'];

/** How far a site check-in may be before it is flagged, the location window, and the km rate. */
export function SiteTravelSection({
  travel,
  onChange,
  errors,
}: {
  readonly travel: Travel;
  readonly onChange: (travel: Travel) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('siteActivity.settings');
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label={t('farFromSite')}
          hint={t('farFromSiteHint')}
          error={errors['travel.farFromSiteM']}
        >
          <NumberInput
            unit="whole"
            value={travel.farFromSiteM}
            onValueChange={(value) => onChange({ ...travel, farFromSiteM: value ?? 0 })}
          />
        </Field>
        <Field label={t('pinTrust')} hint={t('pinTrustHint')} error={errors['travel.pinTrustM']}>
          <NumberInput
            unit="whole"
            value={travel.pinTrustM}
            onValueChange={(value) => onChange({ ...travel, pinTrustM: value ?? 0 })}
          />
        </Field>
        <Field label={t('rate')} hint={t('rateHint')} error={errors['travel.ratePaisePerKm']}>
          <NumberInput
            unit="paise"
            value={travel.ratePaisePerKm}
            onValueChange={(value) => onChange({ ...travel, ratePaisePerKm: value ?? 0 })}
          />
        </Field>
        <Field
          label={t('margin')}
          hint={t('marginHint')}
          error={errors['travel.hoursMarginMinutes']}
        >
          <NumberInput
            unit="whole"
            value={travel.hoursMarginMinutes}
            onValueChange={(value) => onChange({ ...travel, hoursMarginMinutes: value ?? 0 })}
          />
        </Field>
      </div>
    </SettingsSection>
  );
}
