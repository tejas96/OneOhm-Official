/** The shipped testing-and-commissioning task; its key never changes (PRD 3.17). */
export const COMMISSIONING_TASK_KEY = 'testing_commissioning';

/**
 * Whether finishing this task commissions the system, so its installed parts and
 * warranties are recorded: the commissioning task always does, whatever its "When done"
 * is set to, and so does any task set to commissioning or to mark the project operational.
 */
export function startsWarranties(task: {
  readonly templateKey: string;
  readonly onComplete: string | null;
}): boolean {
  return (
    task.templateKey === COMMISSIONING_TASK_KEY ||
    task.onComplete === 'commissioning_completed' ||
    task.onComplete === 'project_operational'
  );
}
