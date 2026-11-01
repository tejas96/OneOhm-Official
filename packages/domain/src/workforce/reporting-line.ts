/**
 * Who a person reports to (PRD 3.12). It is optional: people without a manager work
 * exactly as before. A manager hears when their people ask for help on a task (PRD 4.4)
 * and sees their leave requests first, before the leave approvers (PRD 4.6).
 */
export type ReportingLineProblem = 'self' | 'loop';

/**
 * Checks a new "reports to": nobody reports to themselves, and the lines never go round
 * in a circle (Asha → Vikas → Asha). `managers` is everyone's current manager, by person.
 */
export function reportingLineProblem(input: {
  readonly userId: string;
  readonly managerUserId: string | null;
  readonly managers: ReadonlyMap<string, string>;
}): ReportingLineProblem | null {
  const { userId, managerUserId, managers } = input;
  if (!managerUserId) return null;
  if (managerUserId === userId) return 'self';
  const seen = new Set<string>();
  let next: string | undefined = managerUserId;
  while (next && !seen.has(next)) {
    if (next === userId) return 'loop';
    seen.add(next);
    next = managers.get(next);
  }
  return null;
}

/**
 * Who sees a new leave request first: the person's manager when they have an active one
 * (other than themselves). Null means it goes straight to the leave approvers, as before.
 */
export function leaveFirstReviewer(input: {
  readonly applicantUserId: string;
  readonly manager: { readonly id: string; readonly active: boolean } | null;
}): string | null {
  const { manager } = input;
  if (!manager?.active || manager.id === input.applicantUserId) return null;
  return manager.id;
}

export interface HelpRecipients {
  /** People told by name. */
  readonly userIds: readonly string[];
  /** Also tell everyone who manages projects (the project has no manager). */
  readonly projectManagers: boolean;
}

/**
 * Who hears that someone asked for help on a task: the project's manager (or everyone
 * who manages projects when it has none), and the asker's own manager as well. Nobody is
 * told about their own request, and nobody twice.
 */
export function helpRecipients(input: {
  readonly askerUserId: string;
  readonly projectManagerUserId: string | null;
  readonly askerManagerUserId: string | null;
}): HelpRecipients {
  const { askerUserId, projectManagerUserId, askerManagerUserId } = input;
  const userIds: string[] = [];
  const add = (id: string | null) => {
    if (id && id !== askerUserId && !userIds.includes(id)) userIds.push(id);
  };
  const projectHasManager = Boolean(projectManagerUserId && projectManagerUserId !== askerUserId);
  add(projectManagerUserId);
  add(askerManagerUserId);
  return { userIds, projectManagers: !projectHasManager };
}
