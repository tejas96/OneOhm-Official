import type { ProjectType } from '../epc/stages';

/**
 * The kinds of project OneOhm builds (PRD 7.2 "project types"): each customer kind on a
 * roof or on the ground. Owners rename them, describe them and switch them off; a new
 * kind needs its own task rules, so the list itself is fixed.
 */
export const PROJECT_VARIANTS = [
  'residential',
  'residential_ground',
  'society',
  'society_ground',
  'commercial',
  'commercial_ground',
] as const;
export type ProjectVariant = (typeof PROJECT_VARIANTS)[number];

export interface ProjectVariantDefault {
  readonly key: ProjectVariant;
  readonly type: ProjectType;
  readonly groundMount: boolean;
  readonly name: string;
  readonly description: string;
}

export const DEFAULT_PROJECT_VARIANTS: readonly ProjectVariantDefault[] = [
  {
    key: 'residential',
    type: 'residential',
    groundMount: false,
    name: 'Home rooftop',
    description: 'A house roof under PM Surya Ghar, usually 1–10 kW with subsidy.',
  },
  {
    key: 'residential_ground',
    type: 'residential',
    groundMount: true,
    name: 'Home ground mount',
    description: 'A home system on open land next to the house, on a raised structure.',
  },
  {
    key: 'society',
    type: 'society',
    groundMount: false,
    name: 'Housing society rooftop',
    description: 'A shared roof for common areas, with the society subsidy and committee papers.',
  },
  {
    key: 'society_ground',
    type: 'society',
    groundMount: true,
    name: 'Housing society ground mount',
    description: 'A society system on open land inside the compound.',
  },
  {
    key: 'commercial',
    type: 'commercial',
    groundMount: false,
    name: 'Commercial rooftop',
    description: 'A shop, office or factory roof. No subsidy; GST invoice to the business.',
  },
  {
    key: 'commercial_ground',
    type: 'commercial',
    groundMount: true,
    name: 'Commercial ground mount',
    description: 'A business system on open land, often larger, with a ground-mount structure.',
  },
];

/** The kind of project for a customer type, on a roof or on the ground. */
export function projectVariantOf(type: ProjectType, groundMount: boolean): ProjectVariant {
  const found = DEFAULT_PROJECT_VARIANTS.find(
    (variant) => variant.type === type && variant.groundMount === groundMount,
  );
  if (!found) throw new Error(`No project kind for ${type}.`);
  return found.key;
}

export function checkProjectVariant(input: {
  readonly name: string;
  readonly description: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.name.trim().length < 2) errors.name = 'Use at least 2 characters.';
  if (input.name.trim().length > 60) errors.name = 'Use at most 60 characters.';
  if (input.description.trim().length > 240) errors.description = 'Use at most 240 characters.';
  return errors;
}
