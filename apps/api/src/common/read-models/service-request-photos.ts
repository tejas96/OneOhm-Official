import type { Attachment } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents } from '@oneohm/database';
import { isMediaType } from '@oneohm/domain';
import { and, asc, inArray, isNull } from 'drizzle-orm';

export interface RequestPhoto {
  readonly id: string;
  readonly name: string;
}

/** What the customer added to one request: photos, and their short video and voice note. */
export interface RequestFiles {
  readonly photos: RequestPhoto[];
  readonly media: Attachment[];
}

/**
 * Files customers added to their help requests, by request, oldest first. Files the
 * technician adds on the visit carry their uploader and are left out here.
 */
export async function filesOfRequests(
  db: DatabaseExecutor,
  requestIds: readonly string[],
): Promise<Map<string, RequestFiles>> {
  const byRequest = new Map<string, RequestFiles>();
  if (requestIds.length === 0) return byRequest;
  const rows = await db
    .select()
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
    if (!row.serviceRequestId) continue;
    const files = byRequest.get(row.serviceRequestId) ?? { photos: [], media: [] };
    if (isMediaType(row.contentType)) {
      files.media.push({
        id: row.id,
        name: row.name,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt.toISOString(),
      });
    } else {
      files.photos.push({ id: row.id, name: row.name });
    }
    byRequest.set(row.serviceRequestId, files);
  }
  return byRequest;
}
