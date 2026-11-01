import { type DatabaseExecutor, documents } from '@oneohm/database';
import { and, asc, inArray, isNull } from 'drizzle-orm';

export interface RequestPhoto {
  readonly id: string;
  readonly name: string;
}

/**
 * Photos customers added to their help requests, by request, oldest first. Files the
 * technician adds on the visit carry their uploader and are left out here.
 */
export async function photosOfRequests(
  db: DatabaseExecutor,
  requestIds: readonly string[],
): Promise<Map<string, RequestPhoto[]>> {
  const byRequest = new Map<string, RequestPhoto[]>();
  if (requestIds.length === 0) return byRequest;
  const rows = await db
    .select({ id: documents.id, name: documents.name, requestId: documents.serviceRequestId })
    .from(documents)
    .where(
      and(
        inArray(documents.serviceRequestId, [...requestIds]),
        isNull(documents.removedAt),
        isNull(documents.uploadedByUserId),
      ),
    )
    .orderBy(asc(documents.createdAt));
  for (const row of rows) {
    if (!row.requestId) continue;
    byRequest.set(row.requestId, [...(byRequest.get(row.requestId) ?? []), row]);
  }
  return byRequest;
}
