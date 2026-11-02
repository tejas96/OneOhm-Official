'use client';

import type { Property, PropertyInput } from '@oneohm/api-contracts';
import { Checkbox, Field, Input, SegmentedControl, Select } from '@oneohm/design-system/web';
import { SUBSIDY_CATEGORIES, type SubsidyCategory } from '@oneohm/domain';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { GpsFields, readCoordinate } from './gps-fields';

const NO_DISCOM = 'none';
type Phase = 'single' | 'three' | 'unknown';

/**
 * The site and its electricity connection (PRD 3.2). Inputs carry `name`s so the parent
 * form reads everything with `readPropertyForm`; choices travel in hidden inputs.
 */
export function PropertyFields({
  initial,
  defaultCategory = 'individual',
  defaultCity,
  defaultLabel,
  errors,
}: {
  readonly initial?: Property | undefined;
  readonly defaultCategory?: SubsidyCategory;
  readonly defaultCity?: string | undefined;
  /** A second site starts unnamed, so it is not called Home like the first. */
  readonly defaultLabel?: string | undefined;
  /** Field messages keyed by property field name. */
  readonly errors: (field: string) => string | undefined;
}) {
  const t = useTranslations('customers.property');
  const categoryT = useTranslations('leads.category');
  const [category, setCategory] = useState<SubsidyCategory>(
    initial?.subsidyCategory ?? defaultCategory,
  );
  const [discom, setDiscom] = useState(initial?.discomId ?? NO_DISCOM);
  const [phase, setPhase] = useState<Phase>(initial?.phase ?? 'unknown');
  const [inSocietyName, setInSocietyName] = useState(initial?.meterInSocietyName ?? false);
  const discoms = useQuery({
    queryKey: ['discoms'],
    queryFn: () => expectStatus(api.catalog.listDiscoms(), 200),
    staleTime: 5 * 60_000,
  });
  const discomOptions = [
    { value: NO_DISCOM, label: t('discomUnknown') },
    ...(discoms.data ?? [])
      .filter((row) => row.active || row.id === initial?.discomId)
      .map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
  ];
  const text = (name: keyof Property) => {
    const value = initial?.[name];
    return value === null || value === undefined ? undefined : String(value);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="subsidyCategory" value={category} />
      <input type="hidden" name="discomId" value={discom} />
      <input type="hidden" name="phase" value={phase} />
      <input type="hidden" name="meterInSocietyName" value={String(inSocietyName)} />
      <Group label={t('category')} wide error={errors('subsidyCategory')}>
        <SegmentedControl
          label={t('category')}
          size="sm"
          value={category}
          onValueChange={setCategory}
          options={SUBSIDY_CATEGORIES.map((value) => ({ value, label: categoryT(value) }))}
          className="self-start"
        />
      </Group>
      <Field label={t('label')} hint={t('labelHint')} required error={errors('label')}>
        <Input name="label" defaultValue={text('label') ?? defaultLabel ?? t('labelDefault')} />
      </Field>
      <Field label={t('floors')} error={errors('floors')}>
        <Input name="floors" type="number" min={0} max={40} defaultValue={text('floors') ?? '1'} />
      </Field>
      <Field label={t('address')} required error={errors('addressLine')} className="sm:col-span-2">
        <Input
          name="addressLine"
          autoComplete="street-address"
          defaultValue={text('addressLine')}
        />
      </Field>
      <Field label={t('city')} required error={errors('city')}>
        <Input name="city" defaultValue={text('city') ?? defaultCity} />
      </Field>
      <Field label={t('district')} required error={errors('district')}>
        <Input name="district" defaultValue={text('district') ?? defaultCity} />
      </Field>
      <Field label={t('state')} required error={errors('state')}>
        <Input name="state" defaultValue={text('state') ?? 'Maharashtra'} />
      </Field>
      <Field label={t('pincode')} error={errors('pincode')}>
        <Input name="pincode" inputMode="numeric" maxLength={6} defaultValue={text('pincode')} />
      </Field>
      <GpsFields initial={initial} errors={errors} />
      {category === 'society' && (
        <Field label={t('households')} hint={t('householdsHint')} error={errors('households')}>
          <Input name="households" type="number" min={1} defaultValue={text('households')} />
        </Field>
      )}
      <p className="mt-2 type-overline text-ink-faint uppercase sm:col-span-2">{t('connection')}</p>
      <Field label={t('discom')} error={errors('discomId')}>
        <Select value={discom} onValueChange={setDiscom} options={discomOptions} />
      </Field>
      <Field
        label={t('consumerNumber')}
        hint={t('consumerNumberHint')}
        error={errors('consumerNumber')}
      >
        <Input name="consumerNumber" defaultValue={text('consumerNumber')} />
      </Field>
      <Field label={t('meterHolder')} hint={t('meterHolderHint')} error={errors('meterHolderName')}>
        <Input name="meterHolderName" defaultValue={text('meterHolderName')} />
      </Field>
      <Field
        label={t('sanctionedLoad')}
        hint={t('sanctionedLoadHint')}
        error={errors('sanctionedLoadW')}
      >
        <Input
          name="sanctionedLoadKw"
          inputMode="decimal"
          defaultValue={
            initial?.sanctionedLoadW ? String(initial.sanctionedLoadW / 1000) : undefined
          }
        />
      </Field>
      <Group label={t('phase')} error={errors('phase')}>
        <SegmentedControl
          label={t('phase')}
          size="sm"
          value={phase}
          onValueChange={setPhase}
          options={(['single', 'three', 'unknown'] as const).map((value) => ({
            value,
            label: t(`phases.${value}`),
          }))}
          className="self-start"
        />
      </Group>
      {category === 'society' && (
        <div className="flex flex-col gap-1.5">
          <Checkbox
            checked={inSocietyName}
            onCheckedChange={setInSocietyName}
            label={t('meterInSocietyName')}
          />
          <FieldMessage message={errors('meterInSocietyName')} />
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  wide,
  error,
  children,
}: {
  readonly label: string;
  readonly wide?: boolean;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="type-label text-ink-muted">{label}</span>
      {children}
      <FieldMessage message={error} />
    </div>
  );
}

/** A field message under a control that is not wrapped in a `Field`. */
export function FieldMessage({ message }: { readonly message: string | undefined }) {
  if (!message) return null;
  return <p className="type-body-sm text-overdue">{message}</p>;
}

/** The property as the API expects it, from a form that holds `PropertyFields`. */
export function readPropertyForm(data: FormData): PropertyInput {
  const text = (name: string) => String(data.get(name) ?? '').trim();
  const orNull = (name: string) => text(name) || null;
  const whole = (name: string) => {
    const value = Number.parseInt(text(name), 10);
    return Number.isFinite(value) ? value : null;
  };
  const category = text('subsidyCategory') as SubsidyCategory;
  const loadKw = Number.parseFloat(text('sanctionedLoadKw').replace(',', '.'));
  const phase = text('phase');
  return {
    label: text('label'),
    addressLine: text('addressLine'),
    city: text('city'),
    district: text('district'),
    state: text('state') || 'Maharashtra',
    pincode: orNull('pincode'),
    subsidyCategory: category,
    households: category === 'society' ? whole('households') : null,
    discomId: text('discomId') === NO_DISCOM ? null : text('discomId'),
    consumerNumber: orNull('consumerNumber'),
    meterHolderName: orNull('meterHolderName'),
    sanctionedLoadW: Number.isFinite(loadKw) && loadKw > 0 ? Math.round(loadKw * 1000) : null,
    phase: phase === 'single' || phase === 'three' ? phase : null,
    meterInSocietyName: category === 'society' ? text('meterInSocietyName') === 'true' : null,
    floors: whole('floors') ?? 1,
    latitude: readCoordinate(data, 'latitude'),
    longitude: readCoordinate(data, 'longitude'),
  };
}
