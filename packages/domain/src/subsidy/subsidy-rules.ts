/**
 * PM Surya Ghar central financial assistance, as configurable data (PRD 3.5).
 * Amounts are paise; capacities are watts-peak. A new rule with a later
 * `validFrom` replaces the old one without code changes.
 */
export const SUBSIDY_CATEGORIES = ['individual', 'society', 'commercial'] as const;
export type SubsidyCategory = (typeof SUBSIDY_CATEGORIES)[number];

export interface SubsidySlab {
  /** Applies to capacity above `fromWp` up to `toWp` (null: no upper bound). */
  readonly fromWp: number;
  readonly toWp: number | null;
  readonly paisePerKw: number;
}

export interface SubsidyRule {
  readonly category: SubsidyCategory;
  readonly validFrom: string;
  readonly slabs: readonly SubsidySlab[];
  readonly capPaise: number;
  /** Societies: eligible capacity is at most this much per household. */
  readonly perHouseholdWp?: number;
  /** Societies: eligible capacity never exceeds this. */
  readonly maxEligibleWp?: number;
}

const RUPEE = 100;

/** Rules as of October 2026 (PRD 3.5). */
export const DEFAULT_SUBSIDY_RULES: readonly SubsidyRule[] = [
  {
    category: 'individual',
    validFrom: '2024-02-13',
    slabs: [
      { fromWp: 0, toWp: 2000, paisePerKw: 30_000 * RUPEE },
      { fromWp: 2000, toWp: 3000, paisePerKw: 18_000 * RUPEE },
    ],
    capPaise: 78_000 * RUPEE,
  },
  {
    category: 'society',
    validFrom: '2024-02-13',
    slabs: [{ fromWp: 0, toWp: null, paisePerKw: 18_000 * RUPEE }],
    capPaise: 90_00_000 * RUPEE,
    perHouseholdWp: 3000,
    maxEligibleWp: 500_000,
  },
  {
    category: 'commercial',
    validFrom: '2024-02-13',
    slabs: [],
    capPaise: 0,
  },
];

/** The rule in force on a date (latest `validFrom` on or before it). */
export function ruleInForce(
  rules: readonly SubsidyRule[],
  category: SubsidyCategory,
  onDate: string,
): SubsidyRule | null {
  const candidates = rules
    .filter((rule) => rule.category === category && rule.validFrom <= onDate)
    .sort((left, right) => right.validFrom.localeCompare(left.validFrom));
  return candidates[0] ?? null;
}
