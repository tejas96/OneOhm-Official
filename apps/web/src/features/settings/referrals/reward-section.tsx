'use client';

import type { ReferralProgramInput } from '@oneohm/api-contracts';
import { Field, SegmentedControl, Select, Switch } from '@oneohm/design-system/web';
import { QUALIFYING_EVENTS, REFERRAL_REWARD_BASES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { switchBasis } from './referral-draft';

type Patch = (patch: Partial<ReferralProgramInput>) => void;

/** On or off, how much a referral earns and the project event that earns it. */
export function RewardSection({
  draft,
  onChange,
  errors,
}: {
  readonly draft: ReferralProgramInput;
  readonly onChange: Patch;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.referrals.reward');
  const eventT = useTranslations('settings.referrals.events');
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <Switch
        checked={draft.active}
        onCheckedChange={(active) => onChange({ active })}
        label={t('active')}
        description={t('activeHint')}
      />
      <div className="flex flex-col gap-1.5">
        <span className="type-label text-ink-muted">{t('basis')}</span>
        <SegmentedControl
          label={t('basis')}
          size="sm"
          value={draft.basis}
          onValueChange={(basis) => onChange(switchBasis(draft, basis))}
          options={REFERRAL_REWARD_BASES.map((value) => ({ value, label: t(`bases.${value}`) }))}
          className="self-start"
        />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label={draft.basis === 'per_kw' ? t('amountPerKw') : t('amount')}
          hint={draft.basis === 'per_kw' ? t('amountPerKwHint') : t('amountHint')}
          required
          error={errors.amountPaise}
        >
          <NumberInput
            unit="paise"
            // ₹0 shows as empty: it is what a cleared amount (after a basis switch) holds.
            value={draft.amountPaise || null}
            onValueChange={(value) => onChange({ amountPaise: value ?? 0 })}
          />
        </Field>
        <Field label={t('event')} hint={t('eventHint')} error={errors.qualifyingEvent}>
          <Select
            value={draft.qualifyingEvent}
            onValueChange={(qualifyingEvent) => onChange({ qualifyingEvent })}
            options={QUALIFYING_EVENTS.map((value) => ({ value, label: eventT(value) }))}
          />
        </Field>
      </div>
    </SettingsSection>
  );
}
