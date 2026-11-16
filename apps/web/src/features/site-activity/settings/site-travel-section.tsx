'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Field, Switch } from '@oneohm/design-system/web';
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
      <Switch
        checked={travel.autoClaim}
        onCheckedChange={(autoClaim) => onChange({ ...travel, autoClaim })}
        label={t('autoClaim')}
        description={travel.autoClaim ? t('autoClaimOn') : t('autoClaimOff')}
      />
      <Switch
        checked={travel.autoApprove}
        onCheckedChange={(autoApprove) => onChange({ ...travel, autoApprove })}
        label={t('autoApprove')}
        description={travel.autoApprove ? t('autoApproveOn') : t('autoApproveOff')}
      />
      <p className="-mt-3 type-body-sm text-ink-faint">{t('autoApproveHint')}</p>
      <Switch
        checked={travel.autoSiteVisits}
        onCheckedChange={(autoSiteVisits) => onChange({ ...travel, autoSiteVisits })}
        label={t('autoSiteVisits')}
        description={travel.autoSiteVisits ? t('autoSiteVisitsOn') : t('autoSiteVisitsOff')}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t('siteFence')} hint={t('siteFenceHint')} error={errors['travel.siteFenceM']}>
          <NumberInput
            unit="whole"
            value={travel.siteFenceM}
            onValueChange={(value) => onChange({ ...travel, siteFenceM: value ?? 0 })}
          />
        </Field>
        <Field
          label={t('routeCap')}
          hint={t('routeCapHint')}
          error={errors['travel.routeCapRatio']}
        >
          <NumberInput
            unit="decimal"
            value={travel.routeCapRatio}
            onValueChange={(value) => onChange({ ...travel, routeCapRatio: value ?? 1 })}
          />
        </Field>
        <Field
          label={t('baseStartMax')}
          hint={t('baseStartMaxHint')}
          error={errors['travel.baseStartMaxKm']}
        >
          <NumberInput
            unit="decimal"
            value={travel.baseStartMaxKm}
            onValueChange={(value) => onChange({ ...travel, baseStartMaxKm: value ?? 1 })}
          />
        </Field>
        <Field
          label={t('commuteDeduct')}
          hint={t('commuteDeductHint')}
          error={errors['travel.commuteDeductKm']}
        >
          <NumberInput
            unit="decimal"
            value={travel.commuteDeductKm}
            onValueChange={(value) => onChange({ ...travel, commuteDeductKm: value ?? 0 })}
          />
        </Field>
        <Field label={t('maxKm')} hint={t('maxKmHint')} error={errors['travel.autoApproveMaxKm']}>
          <NumberInput
            unit="whole"
            value={travel.autoApproveMaxKm}
            onValueChange={(value) => onChange({ ...travel, autoApproveMaxKm: value ?? 0 })}
          />
        </Field>
        <Field
          label={t('maxAmount')}
          hint={t('maxAmountHint')}
          error={errors['travel.autoApproveMaxPaise']}
        >
          <NumberInput
            unit="paise"
            value={travel.autoApproveMaxPaise}
            onValueChange={(value) => onChange({ ...travel, autoApproveMaxPaise: value ?? 0 })}
          />
        </Field>
      </div>
    </SettingsSection>
  );
}
