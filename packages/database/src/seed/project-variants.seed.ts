import { DEFAULT_PROJECT_VARIANTS } from '@oneohm/domain';
import type { Database } from '../client';
import { projectVariants } from '../schema';

/** The kinds of project, once; owners' names, descriptions and switches are left alone. */
export async function seedProjectVariants(db: Database): Promise<void> {
  await db
    .insert(projectVariants)
    .values(
      DEFAULT_PROJECT_VARIANTS.map((variant, position) => ({
        key: variant.key,
        name: variant.name,
        description: variant.description,
        position,
      })),
    )
    .onConflictDoNothing();
}
