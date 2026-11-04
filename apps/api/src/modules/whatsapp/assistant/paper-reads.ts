import { customerActions, type DatabaseExecutor, documents, projects } from '@oneohm/database';
import { and, asc, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { isFiled } from '../chat-files-kept';
import type { PaperPlace } from '../file-paper';
import type { KeptFile } from './file-home';
import type { EarlierPaper, FilePaper, OpenPaper } from './paper-match';

// The reads behind "Which paper is this?": a customer's open requests and kept files.

/** The customer's open requests, oldest first, with the home of each one's project. */
export async function openPapersOf(db: DatabaseExecutor, customerId: string): Promise<OpenPaper[]> {
  return db
    .select({
      id: customerActions.id,
      title: customerActions.title,
      category: sql<string>`coalesce(${customerActions.category}, 'other')`,
      propertyId: sql<
        string | null
      >`coalesce(${projects.propertyId}, ${customerActions.propertyId})`,
      requirementKey: customerActions.requirementKey,
    })
    .from(customerActions)
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .where(
      and(
        eq(customerActions.customerId, customerId),
        eq(customerActions.type, 'paper'),
        eq(customerActions.status, 'open'),
      ),
    )
    .orderBy(asc(customerActions.createdAt), asc(customerActions.id));
}

/** The request of this customer picked a moment ago, as it is now. */
export async function earlierPaper(
  db: DatabaseExecutor,
  customerId: string,
  remembered: FilePaper | null,
): Promise<EarlierPaper | null> {
  if (!remembered || remembered.requestId === 'none') return null;
  const [row] = await db
    .select({
      id: customerActions.id,
      title: customerActions.title,
      status: customerActions.status,
      documentId: customerActions.documentId,
    })
    .from(customerActions)
    .where(
      and(eq(customerActions.id, remembered.requestId), eq(customerActions.customerId, customerId)),
    );
  return row ?? null;
}

/**
 * The customer's files among these still free for a paper: not removed, not on a problem
 * and not the answer to a request, in order.
 */
export async function freeFiles(
  db: DatabaseExecutor,
  customerId: string,
  documentIds: readonly string[],
): Promise<KeptFile[]> {
  if (documentIds.length === 0) return [];
  const own = await db
    .select({ id: documents.id, contentType: documents.contentType })
    .from(documents)
    .where(
      and(
        inArray(documents.id, [...documentIds]),
        eq(documents.customerId, customerId),
        isNull(documents.removedAt),
        isNull(documents.serviceRequestId),
        notExists(
          db
            .select({ id: customerActions.id })
            .from(customerActions)
            .where(eq(customerActions.documentId, documents.id)),
        ),
      ),
    );
  const byId = new Map(own.map((file) => [file.id, file]));
  return documentIds.flatMap((id) => byId.get(id) ?? []);
}

/** The customer's own kept files among these, not removed and not filed yet, in order. */
export async function unfiledFiles(
  db: DatabaseExecutor,
  customerId: string,
  documentIds: readonly string[],
): Promise<KeptFile[]> {
  if (documentIds.length === 0) return [];
  const own = await db
    .select({ id: documents.id, contentType: documents.contentType })
    .from(documents)
    .where(
      and(
        inArray(documents.id, [...documentIds]),
        eq(documents.customerId, customerId),
        isNull(documents.removedAt),
      ),
    );
  const open = new Map<string, KeptFile>();
  for (const file of own) if (!(await isFiled(db, file.id))) open.set(file.id, file);
  return documentIds.flatMap((id) => open.get(id) ?? []);
}

/** Where a filed document is now: its home and its kind. */
export async function placeOf(
  db: DatabaseExecutor,
  documentId: string,
): Promise<PaperPlace | null> {
  const [row] = await db
    .select({
      projectId: documents.projectId,
      propertyId: documents.propertyId,
      category: documents.category,
    })
    .from(documents)
    .where(eq(documents.id, documentId));
  return row ?? null;
}
