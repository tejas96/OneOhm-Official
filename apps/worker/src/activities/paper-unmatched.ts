import { type Database, documents, waMessages } from '@oneohm/database';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';

/** An open request: whose it is, its home (none for a person's paper) and the latest ask. */
export interface AskedPaper {
  readonly customerId: string;
  readonly propertyId: string | null;
  readonly askedAt: Date;
}

/**
 * How many files the customer sent on WhatsApp since the latest ask that answer nothing
 * yet ("Which paper?" left unanswered): kind Other, on the request's home or no home.
 * Such a customer has sent something, so the team matches it instead of chasing them.
 */
export async function filesNotMatched(db: Database, asked: AskedPaper): Promise<number> {
  const home = asked.propertyId
    ? or(isNull(documents.propertyId), eq(documents.propertyId, asked.propertyId))
    : isNull(documents.propertyId);
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${documents.id})::int` })
    .from(documents)
    .innerJoin(waMessages, eq(waMessages.documentId, documents.id))
    .where(
      and(
        eq(documents.customerId, asked.customerId),
        eq(documents.category, 'other'),
        isNull(documents.sortedAt),
        isNull(documents.removedAt),
        gt(documents.createdAt, asked.askedAt),
        home,
      ),
    );
  return row?.count ?? 0;
}

/** What the team reads when the customer sent files but did not say which paper. */
export const unmatchedBody = (customer: string, files: number): string =>
  `${customer} sent ${files === 1 ? '1 file' : `${files} files`} on WhatsApp but did not say which paper. Open the chat and match them.`;
