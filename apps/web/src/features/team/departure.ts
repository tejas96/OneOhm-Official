import type { Departure, Person } from '@oneohm/api-contracts';

export type OpenWorkKey = keyof Departure['counts'];
export type SettlementKey = keyof Departure['settlement'];

/** The removal sheet's "What they have open" order: their customers' work first. */
const OPEN_WORK_ORDER: readonly OpenWorkKey[] = [
  'leads',
  'tasks',
  'proposedTasks',
  'serviceRequests',
  'discomSteps',
  'managedProjects',
  'teamProjects',
  'chats',
  'directReports',
  'leaveApprovals',
  'backupFor',
  'ownPendingLeave',
  'commissionRules',
];

/** Their own leave is cancelled and reseller rules archived; nothing of that moves. */
const NOT_HANDED_OVER: ReadonlySet<OpenWorkKey> = new Set(['ownPendingLeave', 'commissionRules']);

const MONEY_ORDER = ['travelClaims', 'bonusShares', 'payables', 'commissions'] as const;

/** Each kind of open work they hold, zero rows left out. */
export function openWorkRows(counts: Departure['counts']) {
  return OPEN_WORK_ORDER.filter((key) => counts[key] > 0).map((key) => ({
    key,
    count: counts[key],
  }));
}

/** How many items the new person takes over. */
export function handedOverCount(counts: Departure['counts']): number {
  return OPEN_WORK_ORDER.filter((key) => !NOT_HANDED_OVER.has(key)).reduce(
    (sum, key) => sum + counts[key],
    0,
  );
}

/** What the company still owes them: money with its total in paise, then pending points. */
export function settlementRows(settlement: Departure['settlement']): {
  readonly key: SettlementKey;
  readonly count: number;
  readonly paise: number | null;
}[] {
  const money = MONEY_ORDER.filter((key) => settlement[key].count > 0).map((key) => ({
    key,
    count: settlement[key].count,
    paise: settlement[key].paise as number | null,
  }));
  return settlement.pendingPoints > 0
    ? [...money, { key: 'pendingPoints', count: settlement.pendingPoints, paise: null }]
    : money;
}

/** Removed from the team: kept for history, hidden from lists and pickers by default. */
export const isPastMember = (person: Pick<Person, 'status'>) => person.status === 'inactive';

/** Who can take over the leaver's work: active staff, never the leaver or a reseller. */
export function handOverCandidates(people: readonly Person[], leaverId: string): Person[] {
  return people.filter(
    (person) =>
      !isPastMember(person) &&
      person.id !== leaverId &&
      person.roles.some((role) => role.kind === 'staff'),
  );
}

/** The suggested person (their manager) when they are on the list; otherwise nobody yet. */
export function presetTarget(
  candidates: readonly Person[],
  suggestedId: string | null,
): string | undefined {
  return candidates.some((person) => person.id === suggestedId)
    ? (suggestedId ?? undefined)
    : undefined;
}

/**
 * After a removal: confirm and close first, then refresh the team. Refreshing first would
 * refetch the leaver's summary (now all zeros) while the sheet is still open.
 */
export async function finishRemoval(steps: {
  readonly confirm: () => void;
  readonly close: () => void;
  readonly refresh: () => Promise<unknown>;
}): Promise<void> {
  steps.confirm();
  steps.close();
  await steps.refresh();
}
