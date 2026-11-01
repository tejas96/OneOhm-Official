'use client';

import type { CostingDetailInput } from '@oneohm/api-contracts';
import { Field, SegmentedControl } from '@oneohm/design-system/web';
import { ACCESS_LEVELS } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { CrewEditor } from '@/features/settings/rates/crew-editors';
import { DecimalInput } from '@/features/settings/rates/decimal-input';
import { ListEditor, RateSelect, SmallNumber } from '@/features/settings/rates/list-editor';
import { DetailBlock, type DetailPartProps } from './detail-block';

type Equipment = NonNullable<CostingDetailInput['equipment']>[number];

/**
 * Labour, equipment and travel (PRD 3.9 B): the crew by skill, days on site, site
 * visits (each one trip, charged once), how hard the site is to work on, and hired
 * equipment such as scaffolding or lifting.
 */
export function DetailLabour({ detail, used, rates, set }: DetailPartProps) {
  const t = useTranslations('costing.detail');
  const editorT = useTranslations('costing.editors');
  const changed =
    detail.crew !== undefined ||
    detail.days !== undefined ||
    detail.visits !== undefined ||
    detail.access !== undefined ||
    detail.equipment !== undefined;

  return (
    <DetailBlock
      title={t('labour')}
      hint={t('labourHint', { trip: formatInr(used.tripPaise) })}
      changed={changed}
      onReset={() =>
        set({
          crew: undefined,
          days: undefined,
          visits: undefined,
          access: undefined,
          equipment: undefined,
        })
      }
    >
      <CrewEditor
        crew={detail.crew ?? used.crew}
        rates={rates}
        onChange={(crew) => set({ crew })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('days')} hint={t('daysHint')}>
          <DecimalInput
            value={detail.days ?? used.days}
            onValueChange={(days) => set({ days: days && days > 0 ? days : undefined })}
          />
        </Field>
        <Field label={t('visits')} hint={t('visitsHint')}>
          <DecimalInput
            value={detail.visits ?? used.visits}
            onValueChange={(visits) => set({ visits: Math.round(visits ?? 0) })}
          />
        </Field>
      </div>
      <Field label={t('access')}>
        <SegmentedControl
          label={t('access')}
          value={detail.access ?? used.access}
          onValueChange={(access) => set({ access })}
          options={ACCESS_LEVELS.map((value) => ({ value, label: t(`accessLevels.${value}`) }))}
          className="w-full sm:w-auto [&>*]:flex-1"
        />
      </Field>
      <ListEditor<Equipment>
        items={detail.equipment ?? used.equipment}
        onChange={(equipment) => set({ equipment })}
        blank={() => ({
          rate: rates.find((rate) => rate.kind === 'equipment')?.key ?? '',
          qty: 1,
        })}
        addLabel={editorT('addEquipment')}
        emptyLabel={editorT('noEquipment')}
        columns="sm:grid-cols-[minmax(0,1fr)_6rem]"
      >
        {(item, update) => (
          <>
            <RateSelect
              rates={rates}
              kinds={['equipment']}
              value={item.rate}
              onChange={(rate) => update({ ...item, rate })}
              label={editorT('equipment')}
            />
            <SmallNumber
              label={editorT('qty')}
              value={item.qty}
              onChange={(qty) => update({ ...item, qty })}
            />
          </>
        )}
      </ListEditor>
    </DetailBlock>
  );
}
