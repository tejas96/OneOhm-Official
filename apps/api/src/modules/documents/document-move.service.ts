import { Inject, Injectable } from '@nestjs/common';
import type { DocumentRecord, MoveDocument } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  documentRequests,
  documents,
  projectActivities,
  projects,
} from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { canUploadDocuments } from './document-access';
import { propertyOfProject } from './document-links';
import { presentDocuments } from './document-read';
import { openRequestsFor } from './document-request-home';
import { readRequests } from './document-request-read';
import { reopenRequest } from './document-request-reopen';
import { closeRequestWithUpload } from './request-received';

/** What the customer reads on a request reopened because its paper went elsewhere. */
export const FILED_ELSEWHERE = 'Filed on another home';

/**
 * Staff file a customer's paper on another of their homes or as another kind (papers per
 * home, flow 4). Internal, logged on both projects; a request it answered that no longer
 * matches is asked again, and an open request it now matches on the new home is closed.
 */
@Injectable()
export class DocumentMoveService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async move(actor: Actor, id: string, input: MoveDocument): Promise<DocumentRecord> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const [paper] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!paper) throw notFound('That document');
    if (paper.removedAt || paper.replacedAt) {
      throw conflict('This file was replaced or removed. Refresh and try again.', 'changed');
    }
    if (!paper.customerId || paper.taskId) {
      throw invalid("Only a customer's paper can be moved; a task's file stays on its task.");
    }
    const target = await this.targetOf(paper.customerId, input);
    const { projectId, propertyId, code } = target;
    const { category } = input;
    const same = paper.projectId === projectId && paper.propertyId === propertyId;
    if (same && paper.category === category) return this.one(id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ projectId, propertyId, category })
        .where(eq(documents.id, id));
      const message = `Paper moved: ${paper.name} → ${code ?? 'no home (ID / income papers)'}`;
      const onProjects = new Set([paper.projectId, projectId].filter((one) => one !== null));
      for (const onProject of onProjects)
        await tx.insert(projectActivities).values({
          projectId: onProject,
          kind: 'document',
          message,
          userId: actor.userId,
          data: { documentId: id, from: paper.category, to: category },
        });
      await recordAudit(tx, actor.userId, 'document.moved', 'document', id, {
        from: {
          projectId: paper.projectId,
          propertyId: paper.propertyId,
          category: paper.category,
        },
        to: { projectId, propertyId, category },
      });
      await this.reaskAnswered(tx, actor.userId, id, { propertyId, category });
      await closeRequestWithUpload(tx, actor, id, {
        customerId: paper.customerId,
        ...target,
        category,
      });
    });
    return this.one(id);
  }

  /** The project must be the same customer's; no project only for a person's paper. */
  private async targetOf(customerId: string | null, input: MoveDocument) {
    if (!input.projectId) {
      if (!isPersonDocumentCategory(input.category)) {
        throw invalid('Choose the home this paper belongs to.', { projectId: 'Required.' });
      }
      return { projectId: null, propertyId: null, code: null };
    }
    const [project] = await this.db
      .select({
        customerId: projects.customerId,
        propertyId: projects.propertyId,
        code: projects.code,
      })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    if (project.customerId !== customerId) {
      throw conflict("That project is another customer's.", 'other_customer');
    }
    return { projectId: input.projectId, propertyId: project.propertyId, code: project.code };
  }

  /** A request this paper answered for another home or kind is asked again ("ask again"). */
  private async reaskAnswered(
    tx: DatabaseExecutor,
    userId: string,
    documentId: string,
    now: { readonly propertyId: string | null; readonly category: string },
  ) {
    const answered = await readRequests(
      tx,
      and(eq(documentRequests.documentId, documentId), eq(documentRequests.status, 'received')),
    );
    for (const request of answered) {
      const home = await propertyOfProject(tx, request.projectId);
      const sameHome = isPersonDocumentCategory(request.category) || home === now.propertyId;
      if (request.category === now.category && sameHome) continue;
      // A newer request for that paper is already open: the customer is not asked twice.
      const [open] = await openRequestsFor(tx, request.customerId, {
        ...request,
        propertyId: home,
      });
      if (open) continue;
      await reopenRequest(tx, userId, request, { note: FILED_ELSEWHERE, removePaper: false });
    }
  }

  private async one(id: string): Promise<DocumentRecord> {
    const [record] = await presentDocuments(this.db, eq(documents.id, id));
    if (!record) throw notFound('That document');
    return record;
  }
}
