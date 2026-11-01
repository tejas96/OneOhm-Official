'use client';

import type { CostingDetailInput } from '@oneohm/api-contracts';
import { Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { DecimalInput } from '@/features/settings/rates/decimal-input';
import { PartsEditor } from '@/features/settings/rates/site-editors';
import { DetailBlock, type DetailPartProps } from './detail-block';

type Structure = NonNullable<CostingDetailInput['structure']>;

/**
 * The structure as it will be built (PRD 3.9 C): height, tilt, panels in a row and its
 * parts. A structure with no parts stays priced per kW from its benchmark.
 */
export function DetailStructure({ detail, used, rates, set }: DetailPartProps) {
  const t = useTranslations('costing.detail');
  const base = used.structure;
  const current: Structure = {
    heightM: detail.structure?.heightM ?? base.heightM,
    tiltDeg: detail.structure?.tiltDeg ?? base.tiltDeg,
    panelsPerRow: detail.structure?.panelsPerRow ?? base.panelsPerRow,
    parts: detail.structure?.parts ?? base.parts,
  };
  const change = (next: Partial<Structure>) => set({ structure: { ...current, ...next } });

  return (
    <DetailBlock
      title={t('structure')}
      hint={
        base.perKw
          ? t('structurePerKw')
          : t('structureHint', { rows: base.rows, perRow: base.panelsPerRow })
      }
      changed={detail.structure !== undefined}
      onReset={() => set({ structure: undefined })}
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('height')}>
          <DecimalInput
            suffix="m"
            value={current.heightM ?? 0}
            onValueChange={(heightM) => change({ heightM: heightM ?? 0 })}
          />
        </Field>
        <Field label={t('tilt')}>
          <DecimalInput
            suffix="°"
            value={current.tiltDeg ?? 0}
            onValueChange={(tiltDeg) => change({ tiltDeg: tiltDeg ?? 0 })}
          />
        </Field>
        <Field label={t('panelsPerRow')}>
          <DecimalInput
            value={current.panelsPerRow ?? 1}
            onValueChange={(value) => change({ panelsPerRow: Math.max(1, Math.round(value ?? 1)) })}
          />
        </Field>
      </div>
      <PartsEditor
        parts={current.parts ?? []}
        rates={rates}
        onChange={(parts) => change({ parts })}
      />
    </DetailBlock>
  );
}
