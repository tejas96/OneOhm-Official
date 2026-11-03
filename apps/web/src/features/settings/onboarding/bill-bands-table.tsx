'use client';

import type { OnboardingSettingsRecord } from '@oneohm/api-contracts';
import { Input } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';

type Bands = OnboardingSettingsRecord['billBands'];

/**
 * The monthly-bill choices as a table of label and system size in kW. An empty size
 * means "our expert prices it". The bands themselves (how many, their order, the typed
 * amount limits) stay as saved; only the label and the size change here.
 */
export function BillBandsTable({
  bands,
  onChange,
}: {
  readonly bands: Bands;
  readonly onChange: (bands: Bands) => void;
}) {
  const t = useTranslations('settings.onboarding');
  const change = (index: number, changes: Partial<Bands[number]>) =>
    onChange(bands.map((band, at) => (at === index ? { ...band, ...changes } : band)));
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden gap-3 type-label text-ink-muted sm:grid sm:grid-cols-[1fr_12rem]">
        <span>{t('bandLabel')}</span>
        <span>{t('bandSize')}</span>
      </div>
      {bands.map((band, index) => (
        <div key={band.id} className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Input
            aria-label={t('bandLabel')}
            value={band.label}
            maxLength={24}
            onChange={(event) => change(index, { label: event.target.value })}
          />
          <NumberInput
            aria-label={t('bandSize')}
            unit="watts"
            value={band.targetWp}
            placeholder={t('bandExpert')}
            onValueChange={(targetWp) => change(index, { targetWp })}
          />
        </div>
      ))}
    </div>
  );
}
