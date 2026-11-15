/** Fields a task's customer message can fill; templates needing others cannot be picked. */
export const TASK_MESSAGE_FIELDS = [
  'customer',
  'project',
  'milestone',
  'capacity',
  // The task's report or paper link, when the template attaches one (PRD 6.2).
  'link',
] as const;

/** When a task's customer message goes out. */
export const TASK_NOTIFY_EVENTS = ['started', 'completed', 'approved'] as const;
export type TaskNotifyEvent = (typeof TASK_NOTIFY_EVENTS)[number];
