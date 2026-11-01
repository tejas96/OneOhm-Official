/**
 * A scope or product change on a live project (PRD 3.6 "Project change requests", 3.15
 * "Other change requests"): what is asked, said in plain kinds so people see at a glance
 * what moves. The change itself is the accepted quotation's choices with edits applied.
 */
export const PROJECT_CHANGE_KINDS = [
  'capacity',
  'battery_added',
  'battery_removed',
  'battery_changed',
  'panel',
  'inverter',
  'structure',
  'extra_lines',
] as const;
export type ProjectChangeKind = (typeof PROJECT_CHANGE_KINDS)[number];

/**
 * Raised → approved (a manager agreed; the revision quotation is drafted and goes to the
 * customer) → accepted (the customer confirmed; the project moved to it). Rejected by the
 * customer, or withdrawn by the team, leaves the project as it was.
 */
export const PROJECT_CHANGE_STATUSES = [
  'raised',
  'approved',
  'accepted',
  'rejected',
  'withdrawn',
] as const;
export type ProjectChangeStatus = (typeof PROJECT_CHANGE_STATUSES)[number];

export const OPEN_CHANGE_STATUSES: readonly ProjectChangeStatus[] = ['raised', 'approved'];

/** The choices a change can touch, as the accepted quotation holds them. */
export interface ScopeChoices {
  readonly targetWp: number;
  readonly panelProductId: string;
  readonly inverterProductId: string;
  readonly batteryProductId: string | null;
  readonly structureType: string;
  /** The hand-added lines, compared as a whole. */
  readonly extras: readonly unknown[];
}

function batteryKind(before: ScopeChoices, after: ScopeChoices): ProjectChangeKind | null {
  if (before.batteryProductId === after.batteryProductId) return null;
  if (!before.batteryProductId) return 'battery_added';
  if (!after.batteryProductId) return 'battery_removed';
  return 'battery_changed';
}

/** What a change asks for, in a fixed order; empty when nothing differs. */
export function changeKinds(before: ScopeChoices, after: ScopeChoices): ProjectChangeKind[] {
  const kinds: (ProjectChangeKind | null)[] = [
    before.targetWp === after.targetWp ? null : 'capacity',
    batteryKind(before, after),
    before.panelProductId === after.panelProductId ? null : 'panel',
    before.inverterProductId === after.inverterProductId ? null : 'inverter',
    before.structureType === after.structureType ? null : 'structure',
    JSON.stringify(before.extras) === JSON.stringify(after.extras) ? null : 'extra_lines',
  ];
  return kinds.filter((kind): kind is ProjectChangeKind => kind !== null);
}

/** The project's own flags that decide its tasks (PRD 3.7 conditions). */
export interface ScopeFlags {
  readonly battery: boolean;
  readonly groundMount: boolean;
  readonly subsidy: boolean;
}

/**
 * The project's flags once the change applies. A flag set by hand at creation (a battery
 * with no battery on the quote, say) stays unless the change itself adds or removes it.
 */
export function flagsAfterChange(
  current: ScopeFlags,
  before: ScopeChoices,
  after: ScopeChoices,
  subsidyAfterPaise: number,
): ScopeFlags {
  const batteryMoved = Boolean(before.batteryProductId) !== Boolean(after.batteryProductId);
  const structureMoved = before.structureType !== after.structureType;
  return {
    battery: batteryMoved ? after.batteryProductId !== null : current.battery,
    groundMount: structureMoved ? after.structureType === 'ground_mount' : current.groundMount,
    subsidy: subsidyAfterPaise > 0,
  };
}
