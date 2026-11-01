import type { Capability, RoleKind } from '@oneohm/domain';

export interface TaskViewer {
  readonly userId: string;
  readonly kind: RoleKind;
  readonly capabilities: ReadonlySet<Capability>;
}

/**
 * Who may open one task: its assignee, or staff who approve tasks or see every project.
 * Partner crews see only their own work, whatever else their role holds.
 */
export function canViewTask(
  viewer: TaskViewer,
  task: { readonly assigneeUserId: string | null },
): boolean {
  if (task.assigneeUserId === viewer.userId) return true;
  if (viewer.kind === 'partner') return false;
  return viewer.capabilities.has('tasks.approve') || viewer.capabilities.has('projects.view_all');
}
