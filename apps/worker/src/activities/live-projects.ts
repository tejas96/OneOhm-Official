import { type Database, projects, projectTasks } from '@oneohm/database';
import { inArray } from 'drizzle-orm';

/** Tasks on projects still running: cancelled or finished projects never nag anyone. */
export function onLiveProject(db: Database) {
  return inArray(
    projectTasks.projectId,
    db
      .select({ id: projects.id })
      .from(projects)
      .where(inArray(projects.status, ['active', 'operational'])),
  );
}
