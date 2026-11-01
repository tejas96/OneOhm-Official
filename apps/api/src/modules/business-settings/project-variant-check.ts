import { type DatabaseExecutor, projectVariants } from '@oneohm/database';
import { type ProjectType, projectVariantOf } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';

/**
 * A new project only for a kind the owner offers (PRD 7.2 "project types"). Projects
 * already running are never touched by switching a kind off.
 */
export async function assertVariantOffered(
  db: DatabaseExecutor,
  type: ProjectType,
  groundMount: boolean,
): Promise<void> {
  const [row] = await db
    .select({ name: projectVariants.name, active: projectVariants.active })
    .from(projectVariants)
    .where(eq(projectVariants.key, projectVariantOf(type, groundMount)));
  if (row && !row.active)
    throw conflict(
      `${row.name} projects are switched off in Settings → Project types.`,
      'project_type_off',
    );
}
