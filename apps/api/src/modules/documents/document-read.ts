import type { Attachment, DocumentRecord } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents, projects, projectTasks, users } from '@oneohm/database';
import { and, desc, eq, isNull, not, type SQL, sql } from 'drizzle-orm';
import { geotagsOf } from '../site-activity/photo-geotag';

type DocumentRow = typeof documents.$inferSelect;

export function toAttachment(row: DocumentRow): Attachment {
  return {
    id: row.id,
    name: row.name,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Current files only: not replaced, not removed, and never the company's own assets. */
export const currentProjectFiles = and(
  isNull(documents.replacedAt),
  isNull(documents.removedAt),
  not(sql`${documents.category} like 'company\\_%'`),
) as SQL;

/** Documents with their project code, task title and uploader, newest first. */
export async function presentDocuments(
  db: DatabaseExecutor,
  where: SQL,
): Promise<DocumentRecord[]> {
  const rows = await db
    .select({
      document: documents,
      projectCode: projects.code,
      taskTitle: projectTasks.title,
      uploaderName: users.fullName,
    })
    .from(documents)
    .leftJoin(projects, eq(projects.id, documents.projectId))
    .leftJoin(projectTasks, eq(projectTasks.id, documents.taskId))
    .leftJoin(users, eq(users.id, documents.uploadedByUserId))
    .where(where)
    .orderBy(desc(documents.createdAt));
  const geotags = await geotagsOf(
    db,
    rows.map((row) => row.document.id),
  );
  return rows.map(({ document, projectCode, taskTitle, uploaderName }) => ({
    ...toAttachment(document),
    category: document.category,
    source: document.source,
    projectId: document.projectId,
    projectCode,
    taskId: document.taskId,
    taskTitle,
    customerId: document.customerId,
    propertyId: document.propertyId,
    reportKey: document.reportKey,
    leadId: document.leadId,
    vendorId: document.vendorId,
    contractorId: document.contractorId,
    uploadedBy:
      document.uploadedByUserId && uploaderName
        ? { id: document.uploadedByUserId, fullName: uploaderName }
        : null,
    replaced: document.replacesDocumentId !== null,
    geotag: geotags.get(document.id) ?? null,
  }));
}
