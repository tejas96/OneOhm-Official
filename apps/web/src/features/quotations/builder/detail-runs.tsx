'use client';

import type { CableRunInputValues } from '@oneohm/api-contracts';
import { CABLE_ROUTES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { ListEditor, RateSelect } from '@/features/settings/rates/list-editor';
import { RowSelect } from '@/features/settings/rates/site-editors';
import { DetailBlock, type DetailPartProps } from './detail-block';
import { RunNumber } from './run-number';

const NONE = 'none';

type Used = DetailPartProps['used']['runs'][number];
const asInput = (run: Used): CableRunInputValues => ({
  kind: run.kind,
  cable: run.cable,
  routing: run.routing,
  floor: run.floor,
  acrossM: run.acrossM,
  upM: run.upM,
  runs: run.runs,
});

/**
 * Cable runs floor by floor and route by route (PRD 3.4, 3.9 A): metres across and up,
 * how many cables share the route, the cable and the routing. Starts from the runs the
 * engine assumed; changing a run makes its kind (DC, AC or earthing) measured.
 */
export function DetailRuns({ detail, used, rates, set }: DetailPartProps) {
  const t = useTranslations('costing.detail');
  const editorT = useTranslations('costing.editors');
  const routeT = useTranslations('costing.routes');
  // Kinds the quotation measured are its own runs; the others stay the engine's estimate,
  // shown for editing and kept out of the quotation until one of them changes.
  const measuredKinds = new Set((detail.runs ?? []).map((run) => run.kind));
  const assumed = used.runs.filter((run) => !measuredKinds.has(run.kind)).map(asInput);
  const runs = [...(detail.runs ?? []), ...assumed];
  const change = (next: CableRunInputValues[]) => {
    const untouched = (run: CableRunInputValues) =>
      assumed.some((entry) => JSON.stringify(entry) === JSON.stringify(run));
    const kinds = new Set(next.filter((run) => !untouched(run)).map((run) => run.kind));
    const measured = next.filter((run) => kinds.has(run.kind));
    set({ runs: measured.length > 0 ? measured : undefined });
  };
  const routing = rates.filter((rate) => rate.kind === 'routing');
  const cableM = used.runs.reduce((sum, run) => sum + run.cableM, 0);

  return (
    <DetailBlock
      title={t('runs')}
      hint={t('runsHint', { metres: Math.round(cableM * 10) / 10 })}
      changed={detail.runs !== undefined}
      onReset={() => set({ runs: undefined })}
    >
      <ListEditor<CableRunInputValues>
        items={runs}
        onChange={change}
        blank={() => ({ kind: 'dc', floor: null, acrossM: 0, upM: 0, runs: 2 })}
        addLabel={editorT('addRoute')}
        emptyLabel={editorT('noRoutes')}
        columns="sm:grid-cols-4"
      >
        {(run, update) => (
          <>
            <RowSelect
              label={editorT('route')}
              value={run.kind}
              onChange={(kind) => update({ ...run, kind })}
              options={CABLE_ROUTES.map((value) => ({ value, label: routeT(value) }))}
            />
            <RateSelect
              rates={rates}
              kinds={['cable']}
              value={run.cable ?? ''}
              onChange={(cable) => update({ ...run, cable })}
              label={editorT('cable')}
              wide
            />
            <RowSelect
              label={editorT('routing')}
              value={run.routing ?? NONE}
              onChange={(value) => update({ ...run, routing: value === NONE ? null : value })}
              options={[
                { value: NONE, label: editorT('noRouting') },
                ...routing.map((rate) => ({ value: rate.key, label: rate.label })),
              ]}
            />
            <RunNumber
              field="floor"
              label={editorT('floor')}
              value={run.floor}
              onChange={(floor) => update({ ...run, floor })}
            />
            <RunNumber
              field="acrossM"
              label={editorT('across')}
              value={run.acrossM}
              onChange={(acrossM) => update({ ...run, acrossM })}
            />
            <RunNumber
              field="upM"
              label={editorT('up')}
              value={run.upM}
              onChange={(upM) => update({ ...run, upM })}
            />
            <RunNumber
              field="runs"
              label={editorT('runs')}
              value={run.runs}
              onChange={(runs) => update({ ...run, runs })}
            />
          </>
        )}
      </ListEditor>
    </DetailBlock>
  );
}
