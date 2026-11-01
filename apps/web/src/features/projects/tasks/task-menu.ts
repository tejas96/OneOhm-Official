import type { ProjectTask } from '@oneohm/api-contracts';
import {
  CalendarClock,
  CircleCheck,
  Hourglass,
  type LucideIcon,
  MessageSquareText,
  Play,
  ShieldCheck,
  Undo2,
  UserRoundPen,
} from 'lucide-react';
import { isBlocked } from './task-status';

export type DialogName = 'complete' | 'waiting' | 'assign' | 'reschedule' | 'update' | 'sendBack';
export type QuickAction = 'start' | 'approve';

/** What the person may do with this task, worked out once from who they are. */
export interface TaskRights {
  /** The assignee, or a manager. */
  readonly work: boolean;
  /** Holds tasks.assign or projects.manage. */
  readonly manage: boolean;
  readonly assign: boolean;
  /** One of the people who may approve or send back this task's work. */
  readonly review: boolean;
}

export interface TaskStep {
  readonly key: string;
  readonly icon: LucideIcon;
  readonly run: { readonly dialog: DialogName } | { readonly quick: QuickAction };
}

const step = (key: string, icon: LucideIcon, run: TaskStep['run']): TaskStep => ({
  key,
  icon,
  run,
});

/** The one next step for the task as a button, or null when there is none for this person. */
export function primaryStep(task: ProjectTask, rights: TaskRights): TaskStep | null {
  if (task.status === 'completed') return null;
  if (task.status === 'in_review')
    return rights.review ? step('approve', ShieldCheck, { quick: 'approve' }) : null;
  if (!rights.work || isBlocked(task)) return null;
  if (task.status === 'pending' || task.status === 'ready')
    return step('start', Play, { quick: 'start' });
  return step('complete', CircleCheck, { dialog: 'complete' });
}

/** Everything else the person may do, in the order the menu lists it. */
export function menuSteps(task: ProjectTask, rights: TaskRights): TaskStep[] {
  if (task.status === 'completed') return [];
  const primary = primaryStep(task, rights)?.key;
  const blocked = isBlocked(task);
  const reviewing = task.status === 'in_review';
  const steps: TaskStep[] = [];
  if (rights.work && !blocked && !reviewing && primary !== 'complete')
    steps.push(step('complete', CircleCheck, { dialog: 'complete' }));
  if (rights.work && !blocked && task.status === 'waiting')
    steps.push(step('resume', Play, { quick: 'start' }));
  if (rights.review && reviewing) steps.push(step('sendBack', Undo2, { dialog: 'sendBack' }));
  if (rights.work) steps.push(step('update', MessageSquareText, { dialog: 'update' }));
  if (rights.work && !reviewing && task.status !== 'waiting')
    steps.push(step('waiting', Hourglass, { dialog: 'waiting' }));
  if (rights.manage) steps.push(step('reschedule', CalendarClock, { dialog: 'reschedule' }));
  if (rights.assign) steps.push(step('assign', UserRoundPen, { dialog: 'assign' }));
  return steps;
}
