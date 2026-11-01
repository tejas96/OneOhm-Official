import { DEFAULT_WORKFORCE_POLICY } from '@oneohm/domain';
import type { Database } from '../client';
import { workforcePolicy } from '../schema';

/** The starting leave, attendance and points rules. An edited policy is left alone. */
export async function seedWorkforcePolicy(db: Database): Promise<void> {
  await db
    .insert(workforcePolicy)
    .values({ id: 'default', policy: DEFAULT_WORKFORCE_POLICY })
    .onConflictDoNothing({ target: workforcePolicy.id });
}
