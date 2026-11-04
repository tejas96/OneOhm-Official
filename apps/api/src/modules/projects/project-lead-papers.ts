import { type DatabaseExecutor, documents } from '@oneohm/database';
import { PERSON_DOCUMENT_CATEGORIES } from '@oneohm/domain';
import { and, eq, isNull, notInArray } from 'drizzle-orm';

/**
 * Papers kept while the home was only a lead now belong to the project, its home and its
 * customer: those the customer sent on the lead, and the home's site papers filed before
 * any project existed.
 */
export async function moveLeadPapers(
  tx: DatabaseExecutor,
  leadId: string | null,
  projectId: string,
  propertyId: string,
  customerId: string,
): Promise<void> {
  if (leadId) {
    await tx
      .update(documents)
      .set({ projectId, propertyId, customerId })
      .where(
        and(eq(documents.leadId, leadId), isNull(documents.projectId), isNull(documents.removedAt)),
      );
  }
  await tx
    .update(documents)
    .set({ projectId })
    .where(
      and(
        eq(documents.propertyId, propertyId),
        eq(documents.customerId, customerId),
        isNull(documents.projectId),
        isNull(documents.removedAt),
        notInArray(documents.category, [...PERSON_DOCUMENT_CATEGORIES]),
      ),
    );
}
