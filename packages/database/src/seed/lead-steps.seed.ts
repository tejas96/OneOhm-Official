import { DEFAULT_LEAD_STEPS } from '@oneohm/domain';
import type { Database } from '../client';
import { leadSteps } from '../schema';

/** One pipeline step per open lead stage, once; owners' edits are left alone. */
export async function seedLeadSteps(db: Database): Promise<void> {
  await db
    .insert(leadSteps)
    .values(DEFAULT_LEAD_STEPS.map((step, position) => ({ ...step, position })))
    .onConflictDoNothing();
}
