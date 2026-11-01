'use client';

import type { QuotationPreview } from '@oneohm/api-contracts';
import { cn, Field, Input, SegmentedControl } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import type { BuilderState, StructureType } from './builder-state';

const STRUCTURES: readonly StructureType[] = ['rcc_elevated', 'tin_shed', 'ground_mount'];

type Patch = (patch: Partial<BuilderState>) => void;
const digits = (text: string) => text.replace(/\D/g, '');
const decimal = (text: string) => text.replace(/[^\d.]/g, '');

/**
 * Site-type defaults (PRD 3.5 quick quote): structure, floors and distance fill the
 * cable, structure and labour lines. Measured cable lengths are optional; the survey
 * replaces the defaults later.
 */
export function SiteFields({
  state,
  patch,
  errors,
}: {
  readonly state: BuilderState;
  readonly patch: Patch;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('quotations.builder.site');
  const structureT = useTranslations('quotations.structure');
  const [measured, setMeasured] = useState(
    state.dcCableMeters !== '' || state.acCableMeters !== '',
  );
  return (
    <div className="flex flex-col gap-6">
      <Field label={t('structure')} hint={t('structureHint')}>
        <SegmentedControl
          label={t('structure')}
          value={state.structureType}
          onValueChange={(value) => patch({ structureType: value })}
          options={STRUCTURES.map((value) => ({ value, label: structureT(value) }))}
          className="w-full sm:w-auto [&>*]:flex-1"
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('floors')} hint={t('floorsHint')} error={errors.floors} required>
          <Input
            inputMode="numeric"
            value={state.floors}
            onChange={(event) => patch({ floors: digits(event.target.value) })}
            className="font-mono"
          />
        </Field>
        <Field label={t('distance')} hint={t('distanceHint')} error={errors.distanceKm} required>
          <Input
            inputMode="numeric"
            value={state.distanceKm}
            onChange={(event) => patch({ distanceKm: digits(event.target.value) })}
            trailing={<span className="pr-2 type-body-sm text-ink-faint">km</span>}
            className="font-mono"
          />
        </Field>
      </div>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setMeasured((value) => !value)}
          aria-expanded={measured}
          className="flex items-center gap-2 self-start type-body-sm font-medium text-accent hover:underline"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-4 transition-transform', measured && 'rotate-90')}
          />
          {t('measured')}
        </button>
        {measured && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('dcCable')} hint={t('cableHint')} error={errors.dcCableMeters}>
              <Input
                inputMode="decimal"
                value={state.dcCableMeters}
                onChange={(event) => patch({ dcCableMeters: decimal(event.target.value) })}
                trailing={<span className="pr-2 type-body-sm text-ink-faint">m</span>}
                className="font-mono"
              />
            </Field>
            <Field label={t('acCable')} hint={t('cableHint')} error={errors.acCableMeters}>
              <Input
                inputMode="decimal"
                value={state.acCableMeters}
                onChange={(event) => patch({ acCableMeters: decimal(event.target.value) })}
                trailing={<span className="pr-2 type-body-sm text-ink-faint">m</span>}
                className="font-mono"
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

/** A discount in rupees; above the configured limit it waits for a manager. */
export function DiscountField({
  state,
  patch,
  preview,
  error,
}: {
  readonly state: BuilderState;
  readonly patch: Patch;
  readonly preview: QuotationPreview | undefined;
  readonly error: string | undefined;
}) {
  const t = useTranslations('quotations.builder.discount');
  const canApprove = useCan('quotations.approve_discount');
  const discount = preview?.totals.discountPaise ?? 0;
  const before = (preview?.totals.totalPaise ?? 0) + discount;
  const percent = before > 0 ? (100 * discount) / before : 0;
  return (
    <div className="flex flex-col gap-3">
      <Field label={t('label')} hint={t('hint')} error={error}>
        <Input
          inputMode="decimal"
          value={state.discountRupees}
          onChange={(event) => patch({ discountRupees: decimal(event.target.value) })}
          leading={<span className="type-body text-ink-faint">₹</span>}
          className="max-w-56 font-mono"
        />
      </Field>
      {discount > 0 && (
        <p className="type-body-sm text-ink-muted">
          {t('share', { amount: formatInr(discount), percent: percent.toFixed(1) })}
        </p>
      )}
      {preview?.discountNeedsApproval && (
        <p className="flex items-start gap-2 rounded-lg bg-review-tint px-3 py-2.5 type-body-sm text-review">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {canApprove ? t('approvedBySaving') : t('needsApproval')}
        </p>
      )}
    </div>
  );
}
