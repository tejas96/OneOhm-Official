import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type DocumentRecord, uploadFieldsSchema } from '@oneohm/api-contracts';
import { documents, projectTasks } from '@oneohm/database';
import { COMPANY_ASSET_FILE_TYPES, SIGNATURE_CATEGORY } from '@oneohm/domain';
import { and, eq, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import {
  canAttach,
  canChangeDocument,
  canViewAllDocuments,
  canViewDocument,
  type DocumentLinks,
} from './document-access';
import { resolveLinks, storageScope } from './document-links';
import { currentProjectFiles, presentDocuments } from './document-read';
import { ObjectStorageService, type StoredObject } from './object-storage.service';
import { checkFile, type IncomingFile } from './upload-file';

export interface DocumentFilter {
  readonly projectId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly customerId?: string | undefined;
  readonly category?: string | undefined;
}

/** Upload, list, stream, replace and remove documents (PRD 3.14). */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
  ) {}

  async list(actor: Actor, filter: DocumentFilter): Promise<DocumentRecord[]> {
    if (!canViewAllDocuments(actor)) {
      const assignee = filter.taskId ? (await this.taskOf(filter.taskId)).assignee : null;
      if (!filter.taskId || assignee !== actor.userId) throw forbidden();
    }
    const conditions: SQL[] = [currentProjectFiles];
    if (filter.projectId) conditions.push(eq(documents.projectId, filter.projectId));
    if (filter.taskId) conditions.push(eq(documents.taskId, filter.taskId));
    if (filter.customerId) conditions.push(eq(documents.customerId, filter.customerId));
    if (filter.category) conditions.push(eq(documents.category, filter.category));
    return presentDocuments(this.db, and(...conditions) as SQL);
  }

  async upload(
    actor: Actor,
    file: IncomingFile | undefined,
    raw: unknown,
  ): Promise<DocumentRecord> {
    const parsed = uploadFieldsSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message]),
      );
      throw invalid('Some details need fixing.', fieldErrors);
    }
    const fields = parsed.data;
    const links = await resolveLinks(this.db, fields);
    if (!canAttach(actor, links.taskAssigneeId)) {
      throw forbidden('Only the person doing this task or the office can add files to it.');
    }
    // A sign-off is drawn on a task and printed on PDFs later: a task's PNG, JPEG or WebP.
    const signature = fields.category === SIGNATURE_CATEGORY;
    if (signature && !links.taskId) {
      throw invalid('A customer signature belongs to a task.', { taskId: 'Required.' });
    }
    const checked = checkFile(file, signature ? COMPANY_ASSET_FILE_TYPES : undefined, fields.name);
    const storageKey = `${storageScope(links)}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          projectId: links.projectId,
          taskId: links.taskId,
          customerId: links.customerId,
          propertyId: links.propertyId,
          category: fields.category,
          source: 'upload',
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
          uploadedByUserId: actor.userId,
        })
        .returning({ id: documents.id });
      if (!row) throw new Error('Document insert returned nothing');
      await recordAudit(tx, actor.userId, 'document.uploaded', 'document', row.id, {
        name: checked.name,
        category: fields.category,
        taskId: links.taskId,
      });
      return row.id;
    });
    return this.one(id);
  }

  async file(actor: Actor, id: string): Promise<StoredObject & { name: string; type: string }> {
    const { row, links } = await this.load(id);
    if (!canViewDocument(actor, links)) throw forbidden();
    const stored = await this.storage.get(row.storageKey);
    return { ...stored, name: row.name, type: row.contentType };
  }

  async replace(actor: Actor, id: string, file: IncomingFile | undefined): Promise<DocumentRecord> {
    const { row, links } = await this.load(id);
    if (row.replacedAt || row.removedAt) throw invalid('This file has already been replaced.');
    if (!canChangeDocument(actor, links)) throw forbidden();
    const checked = checkFile(file, undefined, row.name);
    const scope = storageScope({ projectId: row.projectId, customerId: row.customerId });
    const storageKey = `${scope}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    const newId = await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(documents)
        .set({ replacedAt: now, replacedByUserId: actor.userId })
        .where(eq(documents.id, id));
      const { id: _old, createdAt: _created, ...copy } = row;
      const [created] = await tx
        .insert(documents)
        .values({
          ...copy,
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
          replacesDocumentId: id,
          uploadedByUserId: actor.userId,
          source: 'upload',
        })
        .returning({ id: documents.id });
      if (!created) throw new Error('Document insert returned nothing');
      await recordAudit(tx, actor.userId, 'document.replaced', 'document', id, {
        replacedBy: created.id,
        previousName: row.name,
      });
      return created.id;
    });
    return this.one(newId);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const { row, links } = await this.load(id);
    if (row.removedAt || row.replacedAt) return;
    if (!canChangeDocument(actor, links)) {
      throw forbidden(
        links.taskCompleted
          ? 'This task is done; ask the office to change its files.'
          : 'You cannot remove this file.',
      );
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ removedAt: new Date(), removedByUserId: actor.userId })
        .where(eq(documents.id, id));
      await recordAudit(tx, actor.userId, 'document.removed', 'document', id, { name: row.name });
    });
  }

  private async one(id: string): Promise<DocumentRecord> {
    const [record] = await presentDocuments(this.db, eq(documents.id, id));
    if (!record) throw notFound('That document');
    return record;
  }

  private async taskOf(taskId: string) {
    const [task] = await this.db
      .select({ assignee: projectTasks.assigneeUserId, status: projectTasks.status })
      .from(projectTasks)
      .where(eq(projectTasks.id, taskId))
      .limit(1);
    if (!task) throw notFound('That task');
    return task;
  }

  private async load(id: string) {
    const [row] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!row) throw notFound('That document');
    const task = row.taskId ? await this.taskOf(row.taskId) : null;
    const links: DocumentLinks = {
      uploadedByUserId: row.uploadedByUserId,
      category: row.category,
      taskAssigneeId: task?.assignee ?? null,
      taskCompleted: task?.status === 'completed',
    };
    return { row, links };
  }
}
