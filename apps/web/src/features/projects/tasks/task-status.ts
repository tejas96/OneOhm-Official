import type { ProjectTask } from '@oneohm/api-contracts';
import type { PillTone, StatusGlyphName } from '@oneohm/design-system/web';

type TaskStatus = ProjectTask['status'];

const STATUS_TONE: Readonly<Record<TaskStatus, PillTone>> = {
  pending: 'neutral',
  ready: 'neutral',
  in_progress: 'onTrack',
  waiting: 'waiting',
  in_review: 'review',
  completed: 'done',
};

const STATUS_GLYPH: Readonly<Record<TaskStatus, StatusGlyphName>> = {
  pending: 'draft',
  ready: 'ready',
  in_progress: 'progress',
  waiting: 'waiting',
  in_review: 'review',
  completed: 'done',
};

/** Still waiting for earlier tasks to finish; normal sequencing, not a problem. */
export const isBlocked = (task: ProjectTask) =>
  task.status !== 'completed' && task.blockedBy.length > 0;

/** Sent back for correction and not yet sent again (PRD 4.4). */
export const isReturned = (task: ProjectTask) =>
  task.returned !== null && task.status !== 'completed' && task.status !== 'in_review';

/** Overdue beats everything except done; queued and not-started tasks stay calm. */
export function taskTone(task: ProjectTask): PillTone {
  if (task.status === 'completed') return 'done';
  if (task.overdue) return 'overdue';
  if (isReturned(task)) return 'atRisk';
  if (isBlocked(task)) return 'neutral';
  return STATUS_TONE[task.status];
}

export function taskGlyph(task: ProjectTask): StatusGlyphName {
  if (task.status !== 'completed' && task.overdue) return 'overdue';
  if (isReturned(task)) return 'changes';
  if (isBlocked(task)) return 'notStarted';
  return STATUS_GLYPH[task.status];
}

/** Message key under `projects.task.status` for the pill. */
export function taskStatusKey(task: ProjectTask): string {
  if (task.status === 'completed') return 'completed';
  if (isReturned(task)) return 'returned';
  if (isBlocked(task)) return 'queued';
  return task.status;
}
