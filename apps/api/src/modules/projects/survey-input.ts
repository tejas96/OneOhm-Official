import type { QuotationInput } from '@oneohm/api-contracts';

const STRUCTURES: readonly [RegExp, QuotationInput['structureType']][] = [
  [/ground/i, 'ground_mount'],
  [/tin|shed|sheet/i, 'tin_shed'],
  [/rcc|elevat|concrete|roof/i, 'rcc_elevated'],
];

const number = (value: string | undefined): number | null => {
  const parsed = value === undefined ? Number.NaN : Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * The accepted quotation's inputs with what the survey measured put in: floors,
 * structure and cable lengths. Facts that are missing or unreadable keep the quote's value.
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
  };
}
