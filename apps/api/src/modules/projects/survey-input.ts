import type { QuotationInput } from '@oneohm/api-contracts';
import { CABLE_RUNS_FACT, parseCableRuns } from '@oneohm/domain';

const STRUCTURES: readonly [RegExp, QuotationInput['structureType']][] = [
  [/ground/i, 'ground_mount'],
  [/tin|shed|sheet/i, 'tin_shed'],
  [/alumin|rail/i, 'aluminium_rail'],
  [/custom/i, 'custom'],
  [/rcc|elevat|concrete|roof/i, 'rcc_elevated'],
];

const number = (value: string | undefined): number | null => {
  const parsed = value === undefined ? Number.NaN : Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * The accepted quotation's inputs with what the survey measured put in: floors,
 * structure, cable lengths and the cable runs floor by floor (PRD 3.4), which replace the
 * quote's runs of the same kind. Facts that are missing or unreadable keep the quote's value.
 */
export function surveyedInput(
  accepted: QuotationInput,
  facts: ReadonlyMap<string, string>,
): QuotationInput {
  const floors = number(facts.get('site_floors'));
  const structureText = facts.get('structure_type') ?? '';
  const structure = STRUCTURES.find(([pattern]) => pattern.test(structureText))?.[1];
  return {
    ...accepted,
    floors: floors === null ? accepted.floors : Math.round(floors),
    structureType: structure ?? accepted.structureType,
    dcCableMeters: number(facts.get('dc_cable_meters')) ?? accepted.dcCableMeters ?? null,
    acCableMeters: number(facts.get('ac_cable_meters')) ?? accepted.acCableMeters ?? null,
    costing: surveyedCosting(accepted.costing ?? null, facts.get(CABLE_RUNS_FACT)),
  };
}

function surveyedCosting(
  costing: QuotationInput['costing'],
  runsText: string | undefined,
): QuotationInput['costing'] {
  const measured = parseCableRuns(runsText ?? '').runs;
  if (measured.length === 0) return costing ?? null;
  const kinds = new Set(measured.map((run) => run.kind));
  const kept = (costing?.runs ?? []).filter((run) => !kinds.has(run.kind));
  return { ...(costing ?? {}), runs: [...kept, ...measured] };
}
