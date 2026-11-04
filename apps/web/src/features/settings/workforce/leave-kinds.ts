import type { WorkforcePolicyInput } from '@oneohm/api-contracts';

export type LeaveKind = WorkforcePolicyInput['leaveTypes'][number];

/**
 * Whether a kind's short name can still change. Once saved, requests can be stored with
 * it, so it is fixed; a kind added on this page and not yet saved can still be renamed.
 */
export function keyEditable(kind: LeaveKind | null, savedKeys: readonly string[]): boolean {
  return kind === null || !savedKeys.includes(kind.key);
}
