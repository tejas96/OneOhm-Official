'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import { useTranslations } from 'next-intl';
import { ListEditor, type RateOption, RateSelect, SmallNumber } from './list-editor';

type Site = RateCardValues['sites']['rcc_elevated'];
type Member = Site['crew'][number];
type Equipment = Site['equipment'][number];

const firstOf = (rates: readonly RateOption[], kind: string) =>
  rates.find((rate) => rate.kind === kind)?.key ?? '';

/** The crew a job needs: a labour rate (per person-day) and how many people. */
export function CrewEditor({
  crew,
  rates,
  onChange,
}: {
  readonly crew: readonly Member[];
  readonly rates: readonly RateOption[];
  readonly onChange: (crew: Member[]) => void;
}) {
  const t = useTranslations('costing.editors');
  return (
    <ListEditor
      items={crew}
      onChange={onChange}
      blank={() => ({ rate: firstOf(rates, 'labour'), workers: 1 })}
      addLabel={t('addCrew')}
      emptyLabel={t('noCrew')}
      columns="sm:grid-cols-[minmax(0,1fr)_6rem]"
    >
      {(member, update) => (
        <>
          <RateSelect
            rates={rates}
            kinds={['labour']}
            value={member.rate}
            onChange={(rate) => update({ ...member, rate })}
            label={t('skill')}
          />
          <SmallNumber
            label={t('workers')}
            value={member.workers}
            onChange={(workers) => update({ ...member, workers: Math.max(1, Math.round(workers)) })}
          />
        </>
      )}
    </ListEditor>
  );
}

/** Hired equipment and the floor it is needed from (0 = every job). */
export function EquipmentEditor({
  equipment,
  rates,
  onChange,
}: {
  readonly equipment: readonly Equipment[];
  readonly rates: readonly RateOption[];
  readonly onChange: (equipment: Equipment[]) => void;
}) {
  const t = useTranslations('costing.editors');
  return (
    <ListEditor
      items={equipment}
      onChange={onChange}
      blank={() => ({ rate: firstOf(rates, 'equipment'), qty: 1, fromFloor: 0 })}
      addLabel={t('addEquipment')}
      emptyLabel={t('noEquipment')}
      columns="sm:grid-cols-[minmax(0,1fr)_5rem_6rem]"
    >
      {(item, update) => (
        <>
          <RateSelect
            rates={rates}
            kinds={['equipment']}
            value={item.rate}
            onChange={(rate) => update({ ...item, rate })}
            label={t('equipment')}
          />
          <SmallNumber
            label={t('qty')}
            value={item.qty}
            onChange={(qty) => update({ ...item, qty })}
          />
          <SmallNumber
            label={t('fromFloor')}
            value={item.fromFloor}
            onChange={(fromFloor) => update({ ...item, fromFloor: Math.round(fromFloor) })}
          />
        </>
      )}
    </ListEditor>
  );
}
