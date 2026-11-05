import { builtInRequirements } from '@oneohm/domain';
import type { Database } from '../client';
import { documentRequirements } from '../schema';

/** OneOhm's list of required papers, once; owners' edits are left alone (PRD 3.14). */
export async function seedDocumentRequirements(db: Database): Promise<void> {
  await db
    .insert(documentRequirements)
    .values(
      builtInRequirements().map((requirement) => ({
        key: requirement.key,
        label: requirement.label,
        why: requirement.why,
        categories: [...requirement.categories],
        fromCustomer: requirement.fromCustomer ?? false,
        conditions: requirement.conditions,
        position: requirement.position,
        builtIn: true,
        maxAgeDays: requirement.maxAgeDays ?? null,
      })),
    )
    .onConflictDoNothing();
}
