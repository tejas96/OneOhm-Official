'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import { Field, Input, Select } from '@oneohm/design-system/web';
import { QUANTITY_PER, RATE_KINDS } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { useCompany } from '../use-settings';
import { BaseLocation, useBaseSaver } from './base-location';
import { hasUnsaved } from './card-draft';
import { DecimalInput } from './decimal-input';
import { ListEditor, RateSelect, SmallNumber } from './list-editor';
import { SaveBar } from './save-bar';
import { useCardSaver } from './use-card-saver';

type Card = RateCardValues;
type Item = Card['jobItems'][number];
const NONE = 'none';

/** What every job carries, extra floors, travel from the base, and site access. */
export function JobTravelView({
  card,
  onUnsaved,
}: {
  readonly card: Card;
  readonly onUnsaved?: (unsaved: boolean) => void;
}) {
  const t = useTranslations('costing.labour');
  const editorT = useTranslations('costing.editors');
  const { save, form } = useCardSaver();
  const company = useCompany();
  const base = useBaseSaver(company.data);
  const [draft, setDraft] = useState(card);
  useEffect(() => setDraft(card), [card]);
  const baseMoved = hasUnsaved(base.point, {
    latitude: company.data?.baseLatitude ?? null,
    longitude: company.data?.baseLongitude ?? null,
  });
  useEffect(
    () => onUnsaved?.(baseMoved || hasUnsaved(draft, card)),
    [baseMoved, draft, card, onUnsaved],
  );
  const set = <K extends keyof Card>(key: K, value: Card[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const travel = (patch: Partial<Card['travel']>) => set('travel', { ...draft.travel, ...patch });
  const errors = form.fieldErrors;
  const labour = card.rateLines.filter((line) => line.kind === 'labour');

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await base.save()) await save(draft);
      }}
    >
      <SettingsSection title={t('jobItems')} description={t('jobItemsHint')}>
        <ListEditor<Item>
          items={draft.jobItems}
          onChange={(jobItems) => set('jobItems', jobItems)}
          blank={() => ({ rate: card.rateLines[0]?.key ?? '', per: 'job', qty: 1 })}
          addLabel={t('addJobItem')}
          emptyLabel={t('noJobItems')}
          columns="sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem]"
        >
          {(item, update) => (
            <>
              <RateSelect
                rates={card.rateLines}
                kinds={RATE_KINDS}
                value={item.rate}
                onChange={(rate) => update({ ...item, rate })}
                label={editorT('rate')}
              />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="type-label text-ink-faint">{editorT('per')}</span>
                <Select
                  label={editorT('per')}
                  value={item.per}
                  onValueChange={(per) => update({ ...item, per })}
                  options={QUANTITY_PER.map((value) => ({
                    value,
                    label: editorT(`perOptions.${value}`),
                  }))}
                />
              </div>
              <SmallNumber
                label={editorT('qty')}
                value={item.qty}
                onChange={(qty) => update({ ...item, qty })}
              />
            </>
          )}
        </ListEditor>
      </SettingsSection>

      <SettingsSection title={t('floors')} description={t('floorsHint')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('floorRate')}>
            <Select
              value={draft.extraFloor.rate ?? NONE}
              onValueChange={(value) =>
                set('extraFloor', { ...draft.extraFloor, rate: value === NONE ? null : value })
              }
              options={[
                { value: NONE, label: t('noFloorRate') },
                ...labour.map((line) => ({ value: line.key, label: line.label })),
              ]}
            />
          </Field>
          <Field label={t('freeFloors')} error={errors['extraFloor.freeFloors']}>
            <NumberInput
              unit="whole"
              value={draft.extraFloor.freeFloors}
              onValueChange={(value) =>
                set('extraFloor', { ...draft.extraFloor, freeFloors: value ?? 0 })
              }
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection title={t('travel')} description={t('travelHint')}>
        <Field label={t('travelLabel')} error={errors['travel.label']}>
          <Input
            value={draft.travel.label}
            onChange={(event) => travel({ label: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label={t('flat')}>
            <NumberInput
              unit="paise"
              value={draft.travel.flatPaise}
              onValueChange={(value) => travel({ flatPaise: value ?? 0 })}
            />
          </Field>
          <Field label={t('baseKm')}>
            <NumberInput
              unit="whole"
              value={draft.travel.baseKm}
              onValueChange={(value) => travel({ baseKm: value ?? 0 })}
            />
          </Field>
          <Field label={t('perKm')}>
            <NumberInput
              unit="paise"
              value={draft.travel.perKmPaise}
              onValueChange={(value) => travel({ perKmPaise: value ?? 0 })}
            />
          </Field>
          <Field label={t('visits')} hint={t('visitsHint')} error={errors['travel.visits']}>
            <NumberInput
              unit="whole"
              value={draft.travel.visits}
              onValueChange={(value) => travel({ visits: value ?? 0 })}
            />
          </Field>
          <Field
            label={t('roadFactor')}
            hint={t('roadFactorHint')}
            error={errors['travel.roadFactorBp']}
          >
            <DecimalInput
              suffix="×"
              value={draft.travel.roadFactorBp / 10_000}
              onValueChange={(value) => travel({ roadFactorBp: Math.round((value ?? 1) * 10_000) })}
            />
          </Field>
        </div>
        <BaseLocation saver={base} />
      </SettingsSection>

      <SettingsSection title={t('access')} description={t('accessHint')}>
        <div className="grid grid-cols-2 gap-4">
          {(['moderate', 'difficult'] as const).map((level) => (
            <Field
              key={level}
              label={t(`accessLevels.${level}`)}
              error={errors[`accessBp.${level}`]}
            >
              <NumberInput
                unit="basisPoints"
                value={draft.accessBp[level]}
                onValueChange={(value) =>
                  set('accessBp', { ...draft.accessBp, [level]: value ?? 0 })
                }
              />
            </Field>
          ))}
        </div>
      </SettingsSection>

      <SaveBar error={form.error ?? base.error} pending={form.pending || base.pending} />
    </form>
  );
}
