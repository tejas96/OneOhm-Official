import type { ProjectType } from '../epc/stages';
import {
  type DocumentRequirement,
  type RequirementContext,
  requiredDocuments,
} from './required-documents';

/** When a paper is needed; an empty rule means every project (PRD 3.14). */
export interface RequirementConditions {
  readonly types?: readonly ProjectType[];
  readonly loan?: boolean;
  readonly subsidy?: boolean;
  readonly nameChange?: boolean;
  readonly discomCodes?: readonly string[];
}

/** A required paper as the owner set it up in Settings. */
export interface ConfiguredRequirement extends DocumentRequirement {
  readonly conditions: RequirementConditions;
  readonly active: boolean;
  readonly position: number;
  /** Shipped with OneOhm: can be renamed or switched off, not deleted. */
  readonly builtIn: boolean;
}

const BUILT_IN_CONDITIONS: Readonly<Record<string, RequirementConditions>> = {
  society: { types: ['society'] },
  loan: { loan: true },
  subsidy_bank: { subsidy: true },
  name_change: { nameChange: true },
};

/** OneOhm's own list with its rules, in order: the starting point for Settings. */
export function builtInRequirements(): ConfiguredRequirement[] {
  return requiredDocuments({ type: 'society', loan: true, subsidy: true, nameChange: true }).map(
    (requirement, position) => ({
      ...requirement,
      conditions: BUILT_IN_CONDITIONS[requirement.key] ?? {},
      active: true,
      position,
      builtIn: true,
    }),
  );
}

/** True when the paper's rule matches the project. */
export function appliesToProject(
  conditions: RequirementConditions,
  project: RequirementContext & { readonly discomCode?: string | null },
): boolean {
  if (conditions.types?.length && !conditions.types.includes(project.type)) return false;
  if (conditions.loan !== undefined && conditions.loan !== project.loan) return false;
  if (conditions.subsidy !== undefined && conditions.subsidy !== project.subsidy) return false;
  if (conditions.nameChange !== undefined && conditions.nameChange !== project.nameChange)
    return false;
  if (conditions.discomCodes?.length) {
    return Boolean(project.discomCode && conditions.discomCodes.includes(project.discomCode));
  }
  return true;
}

/** The papers this project needs, from the owner's list, in the owner's order. */
export function requirementsFor(
  list: readonly ConfiguredRequirement[],
  project: RequirementContext & { readonly discomCode?: string | null },
): ConfiguredRequirement[] {
  return list
    .filter(
      (requirement) => requirement.active && appliesToProject(requirement.conditions, project),
    )
    .sort((a, b) => a.position - b.position);
}
