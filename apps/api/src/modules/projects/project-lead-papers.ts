import { type DatabaseExecutor, documents } from '@oneohm/database';
import { and, eq, isNull } from 'drizzle-orm';

/** Papers the customer sent while only a lead now belong to the project and its home. */
export async function moveLeadPapers(
  tx: DatabaseExecutor,
  leadId: string | null,
  projectId: string,
  propertyId: string,
): Promise<void> {
  if (!leadId) return;
  await tx
    .update(documents)
    .set({ projectId, propertyId })
    .where(
      and(eq(documents.leadId, leadId), isNull(documents.projectId), isNull(documents.removedAt)),
    );
}
