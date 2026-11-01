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

/** Overdue beats everything except done; queued and not-started tasks stay calm. */
export function taskTone(task: ProjectTask): PillTone {
  if (task.status === 'completed') return 'done';
  if (task.overdue) return 'overdue';
  if (isBlocked(task)) return 'neutral';
  return STATUS_TONE[task.status];
}

export function taskGlyph(task: ProjectTask): StatusGlyphName {
  if (task.status !== 'completed' && task.overdue) return 'overdue';
  if (isBlocked(task)) return 'notStarted';
  return STATUS_GLYPH[task.status];
}

/** Message key under `projects.task.status` for the pill. */
export function taskStatusKey(task: ProjectTask): string {
  if (task.status === 'completed') return 'completed';
  if (isBlocked(task)) return 'queued';
  return task.status;
}
