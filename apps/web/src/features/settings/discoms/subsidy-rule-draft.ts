import type { SubsidyRuleInput, SubsidyRuleVersion } from '@oneohm/api-contracts';
import { SUBSIDY_CATEGORIES, type SubsidyCategory } from '@oneohm/domain';

/** One slab as typed: where it ends (null: no limit) and what it pays per kW. */
export interface SlabDraft {
  readonly toWp: number | null;
  readonly paisePerKw: number | null;
}

/** Each slab starts where the one before ends, so people only type the end and the rate. */
export const slabStart = (slabs: readonly SlabDraft[], index: number) =>
  index === 0 ? 0 : (slabs[index - 1]?.toWp ?? 0);

export interface Draft {
  readonly category: SubsidyCategory;
  readonly validFrom: string;
  readonly slabs: readonly SlabDraft[];
  readonly capPaise: number | null;
  readonly perHouseholdWp: number | null;
  readonly maxEligibleWp: number | null;
}

/** A form copied from a rule: an edit starts from itself, a new version from the one in force. */
export function draftFrom(
  rule: SubsidyRuleVersion | undefined,
  category: SubsidyCategory,
  validFrom: string,
): Draft {
  return {
    category,
    validFrom,
    slabs: rule?.slabs.map(({ toWp, paisePerKw }) => ({ toWp, paisePerKw })) ?? [],
    capPaise: rule?.capPaise ?? null,
    perHouseholdWp: rule?.perHouseholdWp ?? null,
    maxEligibleWp: rule?.maxEligibleWp ?? null,
  };
}

/**
 * Commercial customers never get PM Surya Ghar subsidy (the price engine always gives ₹0),
 * so a new version is only offered for homes and societies. A scheduled commercial version
 * that already exists can still be opened.
 */
export function editorCategories(editing: SubsidyCategory | null): readonly SubsidyCategory[] {
  const offered = SUBSIDY_CATEGORIES.filter((category) => category !== 'commercial');
  return editing === 'commercial' ? [...offered, 'commercial'] : offered;
}

/** True when switching category would replace slabs the person has typed or changed. */
export function slabsWouldBeLost(
  typed: readonly SlabDraft[],
  template: readonly SlabDraft[],
): boolean {
  if (typed.length === 0) return false;
  if (typed.length !== template.length) return true;
  return typed.some(
    (slab, index) =>
      slab.toWp !== template[index]?.toWp || slab.paisePerKw !== template[index]?.paisePerKw,
  );
}

/**
 * The body to save, or the fields left empty. An empty rate or cap is never sent as 0:
 * that would quietly save a rule that pays nothing. A rule with no slabs needs no cap.
 */
export function checkDraft(draft: Draft): {
  readonly body: SubsidyRuleInput | null;
  readonly missing: readonly string[];
} {
  const missing = draft.slabs.flatMap((slab, index) =>
    slab.paisePerKw === null ? [`slabs.${index}.paisePerKw`] : [],
  );
  if (draft.slabs.length > 0 && draft.capPaise === null) missing.push('capPaise');
  if (missing.length > 0) return { body: null, missing };
  const society = draft.category === 'society';
  return {
    missing,
    body: {
      category: draft.category,
      validFrom: draft.validFrom,
      slabs: draft.slabs.map((slab, index) => ({
        fromWp: slabStart(draft.slabs, index),
        toWp: slab.toWp,
        paisePerKw: slab.paisePerKw ?? 0,
      })),
      capPaise: draft.capPaise ?? 0,
      perHouseholdWp: society ? draft.perHouseholdWp : null,
      maxEligibleWp: society ? draft.maxEligibleWp : null,
    },
  };
}
