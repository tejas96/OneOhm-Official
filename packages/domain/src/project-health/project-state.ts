import type { WaitingParty } from '../epc/stages';

/** The tones a project card can show; the same set the design system's StatusPill knows. */
export type ProjectTone =
  | 'onTrack'
  | 'atRisk'
  | 'blocked'
  | 'overdue'
  | 'review'
  | 'waiting'
  | 'done'
  | 'neutral';

export interface ProjectStateFacts {
  readonly status: 'active' | 'operational' | 'completed' | 'cancelled';
  /** Work complete and every milestone paid (PRD 3.11 financial closure). */
  readonly financiallyClosed: boolean;
  /** Who still owes money on milestones not yet paid, customer first; null when nobody. */
  readonly unpaidBy: 'customer' | 'bank' | null;
  /** A milestone has fallen due and is not fully paid. */
  readonly paymentDue: boolean;
  /** A due milestone is past the grace days. */
  readonly paymentLate: boolean;
  /** What holds the work back; null when nothing does. */
  readonly blockedBy: ProjectBlock | null;
  /** Who the longest open wait is on; null when no task waits. */
  readonly waitingOn: WaitingParty | null;
  /** Open tasks past due that are the team's own (not waiting on someone outside). */
  readonly overdueTasks: number;
  /** Ready or in-progress tasks with no update for the days set in Settings (spec 3.5). */
  readonly staleTasks: number;
  /** The next open task is due within a day and nobody has started it. */
  readonly nextDueSoonNotStarted: boolean;
}

/** Why work cannot move: an open change request, or a late task that later work needs. */
export interface ProjectBlock {
  readonly kind: 'change_request' | 'dependency';
  /** One plain sentence for the card, e.g. "Name change (CR-2026-0002) is open". */
  readonly detail: string;
}

const BLOCK_LABEL: Readonly<Record<ProjectBlock['kind'], string>> = {
  change_request: 'Blocked — change request',
  dependency: 'Blocked — earlier task late',
};

export interface ProjectState {
  readonly tone: ProjectTone;
  readonly label: string;
}

const PARTY_LABEL: Readonly<Record<WaitingParty, string>> = {
  discom: 'Waiting on DISCOM',
  bank: 'Waiting on bank',
  customer: 'Waiting on customer',
  internal: 'Waiting on our team',
};

/** Finished work: closed when paid, otherwise it stays in view until the money is in (Flow D). */
function finishedState(facts: ProjectStateFacts): ProjectState | null {
  if (facts.status === 'cancelled') return { tone: 'neutral', label: 'Cancelled' };
  if (facts.financiallyClosed) return { tone: 'done', label: 'Closed' };
  if (facts.status !== 'completed') return null;
  if (facts.unpaidBy === 'customer')
    return { tone: 'overdue', label: 'Completed — payment outstanding' };
  if (facts.unpaidBy === 'bank')
    return { tone: 'waiting', label: 'Completed — waiting for bank disbursement' };
  return { tone: 'done', label: 'Completed' };
}

/**
 * The one state on a project card, the most urgent thing first (PRD 3.1, Flow D):
 * finished and closed states, then blocked, late money, the team's own late work,
 * outside waits, the team's own waits, stale work, work about to slip, money due on a
 * switched-on system, and only then on track. An outside wait never hides the team's
 * own lateness, and a task waiting on someone outside is never counted as the team's.
 */
export function projectState(facts: ProjectStateFacts): ProjectState {
  const finished = finishedState(facts);
  if (finished) return finished;
  const operational = facts.status === 'operational';
  if (facts.blockedBy) return { tone: 'blocked', label: BLOCK_LABEL[facts.blockedBy.kind] };
  if (facts.paymentLate)
    return {
      tone: 'overdue',
      label: operational ? 'Operational — payment due' : 'Payment overdue',
    };
  if (facts.overdueTasks > 0)
    return {
      tone: 'overdue',
      label: facts.overdueTasks === 1 ? '1 task overdue' : `${facts.overdueTasks} tasks overdue`,
    };
  if (facts.waitingOn && facts.waitingOn !== 'internal')
    return { tone: 'waiting', label: PARTY_LABEL[facts.waitingOn] };
  if (facts.waitingOn === 'internal') return { tone: 'atRisk', label: PARTY_LABEL.internal };
  if (facts.staleTasks > 0)
    return {
      tone: 'atRisk',
      label: `At risk · ${facts.staleTasks} ${facts.staleTasks === 1 ? 'task' : 'tasks'} with no update`,
    };
  if (facts.nextDueSoonNotStarted) return { tone: 'atRisk', label: 'At risk' };
  if (operational && facts.paymentDue)
    return { tone: 'waiting', label: 'Operational — payment due' };
  if (operational) return { tone: 'onTrack', label: 'Operational' };
  return { tone: 'onTrack', label: 'On track' };
}

/** Tones the owner should look at: the "needing attention" count and filter use this. */
export const ATTENTION_TONES: readonly ProjectTone[] = ['overdue', 'blocked', 'atRisk', 'waiting'];

interface BlockTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly dueDate: string;
}

/**
 * Why work cannot move, or null: an open change request holding back an open task
 * (the DISCOM paperwork comes first), or a task already past its due date that still
 * cannot start because a task it depends on is unfinished.
 */
export function blockedReason(input: {
  readonly today: string;
  readonly tasks: readonly BlockTask[];
  /** taskId → the ids of the tasks it waits for. */
  readonly dependsOn: ReadonlyMap<string, readonly string[]>;
  /** taskId → titles of open change requests that hold it back. */
  readonly changeRequests: ReadonlyMap<string, readonly string[]>;
}): ProjectBlock | null {
  const open = input.tasks.filter((task) => task.status !== 'completed');
  for (const task of open) {
    const request = input.changeRequests.get(task.id)?.[0];
    if (request) return { kind: 'change_request', detail: `${request} is open` };
  }
  const byId = new Map(input.tasks.map((task) => [task.id, task]));
  for (const task of open) {
    if (task.dueDate >= input.today || task.status === 'in_progress') continue;
    const missing = (input.dependsOn.get(task.id) ?? [])
      .map((id) => byId.get(id))
      .find((before) => before && before.status !== 'completed');
    if (missing)
      return { kind: 'dependency', detail: `“${task.title}” needs “${missing.title}” first` };
  }
  return null;
}
