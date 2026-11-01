import { EARLY_TASKS } from './task-library-early';
import { LATE_TASKS } from './task-library-late';
import type { TaskTemplate } from './task-template';

/**
 * OneOhm's project task library, pre-configured so the system works on day one
 * (PRD 3.7, 3.8). Owners edit it in Settings → Task templates. Listed in dependency
 * order: every task comes after the tasks it waits for.
 */
export const DEFAULT_TASK_LIBRARY: readonly TaskTemplate[] = [...EARLY_TASKS, ...LATE_TASKS];
