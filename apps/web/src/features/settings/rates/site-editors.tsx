'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import { Checkbox, Select } from '@oneohm/design-system/web';
import { CABLE_ROUTES, QUANTITY_PER } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { ListEditor, type RateOption, RateSelect, SmallNumber } from './list-editor';

type Site = RateCardValues['sites']['rcc_elevated'];
type Part = Site['parts'][number];
type Route = Site['routes'][number];

const NONE = 'none';
const firstOf = (rates: readonly RateOption[], kinds: readonly string[]) =>
  rates.find((rate) => kinds.includes(rate.kind))?.key ?? '';

/** Labelled select inside an editor row. */
export function RowSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate type-label text-ink-faint">{label}</span>
      <Select
        label={label}
        value={value}
        onValueChange={onChange}
        options={options}
        className="w-full min-w-0 whitespace-nowrap"
      />
    </div>
  );
}

/** Structure parts: which rate, counted per what, how many, and whether it grows with height. */
export function PartsEditor({
  parts,
  rates,
  onChange,
}: {
  readonly parts: readonly Part[];
  readonly rates: readonly RateOption[];
  readonly onChange: (parts: Part[]) => void;
}) {
  const t = useTranslations('costing.editors');
  return (
    <ListEditor
      items={parts}
      onChange={onChange}
      blank={(): Part => ({ rate: firstOf(rates, ['structure']), per: 'panel', qty: 1 })}
      addLabel={t('addPart')}
      emptyLabel={t('noParts')}
      columns="sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem_auto]"
    >
      {(part, update) => (
        <>
          <RateSelect
            rates={rates}
            kinds={['structure', 'labour', 'other']}
            value={part.rate}
            onChange={(rate) => update({ ...part, rate })}
            label={t('part')}
          />
          <RowSelect
            label={t('per')}
            value={part.per}
            onChange={(per) => update({ ...part, per })}
            options={QUANTITY_PER.map((value) => ({ value, label: t(`perOptions.${value}`) }))}
          />
          <SmallNumber
            label={t('qty')}
            value={part.qty}
            onChange={(qty) => update({ ...part, qty })}
          />
          <div className="flex items-center pb-3">
            <Checkbox
              checked={part.perHeightM ?? false}
              onCheckedChange={(checked) => update({ ...part, perHeightM: checked === true })}
              label={t('perHeight')}
            />
          </div>
        </>
      )}
    </ListEditor>
  );
}

/** Default cable routes: kind, cable, routing, metres across, metres down each floor, runs. */
export function RoutesEditor({
  routes,
  rates,
  onChange,
}: {
  readonly routes: readonly Route[];
  readonly rates: readonly RateOption[];
  readonly onChange: (routes: Route[]) => void;
}) {
  const t = useTranslations('costing.editors');
  const routeT = useTranslations('costing.routes');
  const routing = rates.filter((rate) => rate.kind === 'routing');
  return (
    <ListEditor
      items={routes}
      onChange={onChange}
      blank={(): Route => ({
        kind: 'dc',
        cable: firstOf(rates, ['cable']),
        routing: null,
        acrossM: 10,
        upPerFloorM: 3,
        runs: 2,
      })}
      addLabel={t('addRoute')}
      emptyLabel={t('noRoutes')}
      columns="sm:grid-cols-3"
    >
      {(route, update) => (
        <>
          <RowSelect
            label={t('route')}
            value={route.kind}
            onChange={(kind) => update({ ...route, kind })}
            options={CABLE_ROUTES.map((value) => ({ value, label: routeT(value) }))}
          />
          <RateSelect
            rates={rates}
            kinds={['cable']}
            value={route.cable}
            onChange={(cable) => update({ ...route, cable })}
            label={t('cable')}
          />
          <RowSelect
            label={t('routing')}
            value={route.routing ?? NONE}
            onChange={(value) => update({ ...route, routing: value === NONE ? null : value })}
            options={[
              { value: NONE, label: t('noRouting') },
              ...routing.map((rate) => ({ value: rate.key, label: rate.label })),
            ]}
          />
          <SmallNumber
            label={t('across')}
            suffix="m"
            value={route.acrossM}
            onChange={(acrossM) => update({ ...route, acrossM })}
          />
          <SmallNumber
            label={t('upPerFloor')}
            suffix="m"
            value={route.upPerFloorM}
            onChange={(upPerFloorM) => update({ ...route, upPerFloorM })}
          />
          <SmallNumber
            label={t('runs')}
            value={route.runs}
            onChange={(runs) => update({ ...route, runs: Math.max(1, Math.round(runs)) })}
          />
        </>
      )}
    </ListEditor>
  );
}
