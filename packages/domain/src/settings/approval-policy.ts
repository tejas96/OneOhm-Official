import type { Capability } from '../identity/capabilities';
import { checkWhole, type SettingErrors } from './settings-check';

/**
 * Money approval limits (PRD 7.2 "approval policies", 7.3 "sensitive action approvals").
 * The discount limit lives with the rate card; these are the rest. Amounts in paise.
 */
export interface ApprovalPolicy {
  /**
   * Bills up to this amount may be approved by people who record payments; larger ones
   * need someone who approves payments. Zero means every bill needs an approver.
   */
  readonly billLimitPaise: number;
  /**
   * Bonuses up to this total may be approved by managers who manage people; larger ones
   * need someone who approves payments. Zero means every bonus needs an approver.
   */
  readonly bonusLimitPaise: number;
  /** Days an approval may wait before the owner is told. */
  readonly escalateAfterDays: number;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  billLimitPaise: 0,
  bonusLimitPaise: 0,
  escalateAfterDays: 3,
};

/** ₹1 crore: a limit above this is almost certainly a typo. */
const MAX_LIMIT_PAISE = 1_00_00_000_00;

export function checkApprovalPolicy(policy: ApprovalPolicy): SettingErrors {
  const errors: SettingErrors = {};
  for (const field of ['billLimitPaise', 'bonusLimitPaise'] as const) {
    const value = policy[field];
    if (!Number.isInteger(value) || value < 0 || value > MAX_LIMIT_PAISE)
      errors[field] = 'Use an amount from ₹0 to ₹1,00,00,000.';
  }
  checkWhole(errors, 'escalateAfterDays', policy.escalateAfterDays, 1, 30);
  return errors;
}

/**
 * Who may approve an amount under a limit: the senior right always; the everyday right
 * too while the amount is within a limit above zero.
 */
export function approversFor(
  amountPaise: number,
  limitPaise: number,
  senior: Capability,
  everyday: Capability,
): readonly Capability[] {
  return limitPaise > 0 && amountPaise <= limitPaise ? [senior, everyday] : [senior];
}

/** True when someone with these rights may approve the amount under the limit. */
export function mayApproveAmount(
  capabilities: readonly string[],
  amountPaise: number,
  limitPaise: number,
  senior: Capability,
  everyday: Capability,
): boolean {
  return approversFor(amountPaise, limitPaise, senior, everyday).some((right) =>
    capabilities.includes(right),
  );
}
