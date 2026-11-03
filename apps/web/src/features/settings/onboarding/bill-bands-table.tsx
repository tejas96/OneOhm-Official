'use client';

import type { OnboardingSettingsRecord } from '@oneohm/api-contracts';
import { Input } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';

type Bands = OnboardingSettingsRecord['billBands'];

const COLUMNS = 'sm:grid-cols-[1fr_1fr_1fr_8rem_8rem]';

/**
 * The monthly-bill choices as a table of label (with optional Marathi and Hindi words for
 * those chats), system size in kW and the highest bill
 * (₹) a typed amount may have to land on the choice. An empty size means "our expert
 * prices it"; an empty "Up to" means no upper limit, which only the last choice may have.
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
  const last = bands.length - 1;
  const openTooEarly = bands.some((band, index) => index < last && band.maxRupees === null);
  return (
    <div className="flex flex-col gap-3">
      <div className={`hidden gap-3 type-label text-ink-muted sm:grid ${COLUMNS}`}>
        <span>{t('bandLabel')}</span>
        <span>{t('bandLabelMr')}</span>
        <span>{t('bandLabelHi')}</span>
        <span>{t('bandSize')}</span>
        <span>{t('bandMax')}</span>
      </div>
      {bands.map((band, index) => (
        <div key={band.id} className={`grid gap-3 ${COLUMNS}`}>
          <Input
            aria-label={t('bandLabel')}
            value={band.label}
            maxLength={24}
            onChange={(event) => change(index, { label: event.target.value })}
          />
          <Input
            aria-label={t('bandLabelMr')}
            value={band.labelMr ?? ''}
            maxLength={24}
            placeholder={band.label}
            onChange={(event) => change(index, { labelMr: event.target.value })}
          />
          <Input
            aria-label={t('bandLabelHi')}
            value={band.labelHi ?? ''}
            maxLength={24}
            placeholder={band.label}
            onChange={(event) => change(index, { labelHi: event.target.value })}
          />
          <NumberInput
            aria-label={t('bandSize')}
            unit="watts"
            value={band.targetWp}
            placeholder={t('bandExpert')}
            onValueChange={(targetWp) => change(index, { targetWp })}
          />
          <NumberInput
            aria-label={t('bandMax')}
            aria-invalid={index < last && band.maxRupees === null ? true : undefined}
            unit="whole"
            value={band.maxRupees ?? null}
            placeholder={index === last ? t('bandNoLimit') : undefined}
            onValueChange={(maxRupees) => change(index, { maxRupees })}
          />
        </div>
      ))}
      {openTooEarly && <p className="type-body-sm text-overdue">{t('bandMaxNeeded')}</p>}
    </div>
  );
}
