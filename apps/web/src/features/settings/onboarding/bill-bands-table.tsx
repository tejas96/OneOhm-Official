'use client';

import { Button, IconButton, Input } from '@oneohm/design-system/web';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { addBand, type Bands, canAddBand, canRemoveBand, removeBand } from './bill-bands';

const COLUMNS = 'sm:grid-cols-[1fr_1fr_1fr_8rem_8rem_2rem]';

/** A short id for a new choice; the chat uses it to tell choices apart. */
const newId = () => `band_${Math.random().toString(36).slice(2, 10)}`;

/**
 * The monthly-bill choices as a table of label (with optional Marathi and Hindi words for
 * those chats), system size in kW and the highest bill
 * (₹) a typed amount may have to land on the choice. An empty size means "our expert
 * prices it"; an empty "Up to" means no upper limit, which only the last choice may have.
 * Between 2 and 8 choices; the server's errors (`billBands.2.maxRupees`) show per row.
 */
export function BillBandsTable({
  bands,
  onChange,
  errors,
}: {
  readonly bands: Bands;
  readonly onChange: (bands: Bands) => void;
  readonly errors: Readonly<Record<string, string>>;
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
      {bands.map((band, index) => {
        const at = `billBands.${index}`;
        const rowErrors = ['label', 'labelMr', 'labelHi', 'targetWp', 'maxRupees']
          .map((field) => errors[`${at}.${field}`])
          .filter(Boolean);
        return (
          <div key={band.id} className="flex flex-col gap-1">
            <div className={`grid gap-3 ${COLUMNS}`}>
              <Input
                aria-label={t('bandLabel')}
                aria-invalid={errors[`${at}.label`] ? true : undefined}
                value={band.label}
                maxLength={24}
                onChange={(event) => change(index, { label: event.target.value })}
              />
              <Input
                aria-label={t('bandLabelMr')}
                aria-invalid={errors[`${at}.labelMr`] ? true : undefined}
                value={band.labelMr ?? ''}
                maxLength={24}
                placeholder={band.label}
                onChange={(event) => change(index, { labelMr: event.target.value })}
              />
              <Input
                aria-label={t('bandLabelHi')}
                aria-invalid={errors[`${at}.labelHi`] ? true : undefined}
                value={band.labelHi ?? ''}
                maxLength={24}
                placeholder={band.label}
                onChange={(event) => change(index, { labelHi: event.target.value })}
              />
              <NumberInput
                aria-label={t('bandSize')}
                aria-invalid={errors[`${at}.targetWp`] ? true : undefined}
                unit="watts"
                value={band.targetWp}
                placeholder={t('bandExpert')}
                onValueChange={(targetWp) => change(index, { targetWp })}
              />
              <NumberInput
                aria-label={t('bandMax')}
                aria-invalid={
                  errors[`${at}.maxRupees`] || (index < last && band.maxRupees === null)
                    ? true
                    : undefined
                }
                unit="whole"
                value={band.maxRupees ?? null}
                placeholder={index === last ? t('bandNoLimit') : undefined}
                onValueChange={(maxRupees) => change(index, { maxRupees })}
              />
              <IconButton
                size="sm"
                label={t('bandRemove', { label: band.label || String(index + 1) })}
                disabled={!canRemoveBand(bands)}
                onClick={() => onChange(removeBand(bands, index))}
              >
                <Trash2 aria-hidden />
              </IconButton>
            </div>
            {rowErrors.map((message) => (
              <p key={message} className="type-body-sm text-overdue">
                {message}
              </p>
            ))}
          </div>
        );
      })}
      {openTooEarly && <p className="type-body-sm text-overdue">{t('bandMaxNeeded')}</p>}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leadingIcon={<Plus />}
        disabled={!canAddBand(bands)}
        onClick={() => onChange(addBand(bands, newId()))}
        className="self-start"
      >
        {t('bandAdd')}
      </Button>
    </div>
  );
}
