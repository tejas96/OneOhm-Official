'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import { Button, Field, Input, Sheet } from '@oneohm/design-system/web';
import type { StructureType } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { NumberInput } from '../number-input';
import { CrewEditor, EquipmentEditor } from './crew-editors';
import { DecimalInput } from './decimal-input';
import { PartsEditor, RoutesEditor } from './site-editors';
import { useCardSaver } from './use-card-saver';

type Site = RateCardValues['sites'][StructureType];

function Part({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <h3 className="type-title-md text-ink">{title}</h3>
        <p className="type-body-sm text-ink-faint">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** One kind of site: its structure and parts, cable routes, crew and equipment. */
export function SiteTypeSheet({
  card,
  type,
  onClose,
}: {
  readonly card: RateCardValues;
  readonly type: StructureType | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('costing.sites.sheet');
  const typeT = useTranslations('costing.sites.types');
  const commonT = useTranslations('costing.common');
  const formId = useId();
  const { save, form } = useCardSaver();
  const [draft, setDraft] = useState<Site | null>(null);
  const { reset } = form;

  // A new draft only when another site type opens, not when the card refetches meanwhile.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the open site type decides
  useEffect(() => {
    setDraft(type ? card.sites[type] : null);
    reset();
  }, [type, reset]);

  const set = <K extends keyof Site>(key: K, value: Site[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!type || !draft) return;
    if (await save({ ...card, sites: { ...card.sites, [type]: draft } })) onClose();
  };
  const rates = card.rateLines;
  const fieldErrors = Object.values(form.fieldErrors);

  return (
    <Sheet
      open={type !== null}
      onOpenChange={(next) => !next && onClose()}
      title={type ? typeT(type) : ''}
      description={t('description')}
      width="lg"
      footer={
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <FormError message={form.error} />
          <Button
            variant="primary"
            type="submit"
            form={formId}
            pending={form.pending}
            className="sm:ml-auto"
          >
            {commonT('save')}
          </Button>
        </div>
      }
    >
      {draft && (
        <form
          id={formId}
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-8 px-5 py-6 sm:px-6"
        >
          {fieldErrors.length > 0 && (
            <ul className="rounded-lg bg-blocked-tint px-4 py-3 type-body-sm text-blocked">
              {[...new Set(fieldErrors)].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <Part title={t('structure')} hint={t('structureHint')}>
            <Field label={t('label')} hint={t('labelHint')}>
              <Input value={draft.label} onChange={(event) => set('label', event.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label={t('height')}>
                <DecimalInput
                  suffix="m"
                  value={draft.heightM}
                  onValueChange={(value) => set('heightM', value ?? 0)}
                />
              </Field>
              <Field label={t('tilt')}>
                <DecimalInput
                  suffix="°"
                  value={draft.tiltDeg}
                  onValueChange={(value) => set('tiltDeg', value ?? 0)}
                />
              </Field>
              <Field label={t('panelsPerRow')}>
                <DecimalInput
                  value={draft.panelsPerRow}
                  onValueChange={(value) =>
                    set('panelsPerRow', Math.max(1, Math.round(value ?? 1)))
                  }
                />
              </Field>
            </div>
            <PartsEditor
              parts={draft.parts}
              rates={rates}
              onChange={(parts) => set('parts', parts)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('benchmarkPrice')} hint={t('benchmarkHint')}>
                <NumberInput
                  unit="paise"
                  value={draft.perKw.pricePaise}
                  onValueChange={(value) =>
                    set('perKw', { ...draft.perKw, pricePaise: value ?? 0 })
                  }
                />
              </Field>
              <Field label={t('benchmarkCost')}>
                <NumberInput
                  unit="paise"
                  value={draft.perKw.costPaise}
                  onValueChange={(value) => set('perKw', { ...draft.perKw, costPaise: value ?? 0 })}
                />
              </Field>
            </div>
          </Part>
          <Part title={t('routes')} hint={t('routesHint')}>
            <RoutesEditor
              routes={draft.routes}
              rates={rates}
              onChange={(routes) => set('routes', routes)}
            />
          </Part>
          <Part title={t('crew')} hint={t('crewHint')}>
            <CrewEditor crew={draft.crew} rates={rates} onChange={(crew) => set('crew', crew)} />
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('kwPerDay')} hint={t('kwPerDayHint')}>
                <DecimalInput
                  suffix="kW"
                  value={draft.kwPerDay}
                  onValueChange={(value) => set('kwPerDay', value ?? 0)}
                />
              </Field>
              <Field label={t('minDays')}>
                <DecimalInput
                  value={draft.minDays}
                  onValueChange={(value) => set('minDays', value ?? 0)}
                />
              </Field>
            </div>
          </Part>
          <Part title={t('equipment')} hint={t('equipmentHint')}>
            <EquipmentEditor
              equipment={draft.equipment}
              rates={rates}
              onChange={(equipment) => set('equipment', equipment)}
            />
          </Part>
        </form>
      )}
    </Sheet>
  );
}
