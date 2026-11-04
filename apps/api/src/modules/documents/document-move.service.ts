import { Inject, Injectable } from '@nestjs/common';
import type { DocumentHome, DocumentRecord, MoveDocument } from '@oneohm/api-contracts';
import { documents, projectActivities, projects } from '@oneohm/database';
import { isCustomerDocumentCategory, isPersonDocumentCategory } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { customerHomes } from '../customer-portal/customer-homes';
import { canUploadDocuments } from './document-access';
import { settleAnsweredRequests } from './document-move-requests';
import { presentDocuments } from './document-read';
import { closeRequestWithUpload } from './request-received';

/**
 * Staff file a customer's paper on another of their homes or as another kind (papers per
 * home, flow 4). Internal, logged on both projects; a request it answered that no longer
 * matches is asked again, and an open request it now matches on the new home is closed.
 */
@Injectable()
export class DocumentMoveService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The homes the paper may go to: its customer's, one row per home (sheet choices). */
  async homes(actor: Actor, id: string): Promise<DocumentHome[]> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const paper = await this.paperOf(id);
    return customerHomes(this.db, paper.customerId);
  }

  async move(actor: Actor, id: string, input: MoveDocument): Promise<DocumentRecord> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const paper = await this.paperOf(id);
    // Internal kinds (vendor papers, working photos) would hide it from the customer.
    if (!isCustomerDocumentCategory(input.category)) {
      throw invalid('Choose a kind the customer keeps.', { category: 'Not a customer paper.' });
    }
    const target = await this.targetOf(paper.customerId, input);
    const { projectId, propertyId, code } = target;
    const { category } = input;
    const same = paper.projectId === projectId && paper.propertyId === propertyId;
    if (same && paper.category === category) return this.one(id);
    await this.db.transaction(async (tx) => {
      const [changed] = await tx
        .update(documents)
        // A lead's paper given no home stays the person's: not re-homed when the lead sells.
        .set({ projectId, propertyId, category, ...(projectId ? {} : { leadId: null }) })
        .where(and(eq(documents.id, id), isNull(documents.removedAt), isNull(documents.replacedAt)))
        .returning({ id: documents.id });
      if (!changed)
        throw conflict('This file was replaced or removed. Refresh and try again.', 'changed');
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
      await settleAnsweredRequests(tx, actor.userId, id, { propertyId, category });
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

  /** A current paper of a customer, not a task's file. */
  private async paperOf(id: string) {
    const [paper] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!paper) throw notFound('That document');
    if (paper.removedAt || paper.replacedAt) {
      throw conflict('This file was replaced or removed. Refresh and try again.', 'changed');
    }
    if (!paper.customerId || paper.taskId) {
      throw invalid("Only a customer's paper can be moved; a task's file stays on its task.");
    }
    return { ...paper, customerId: paper.customerId };
  }

  private async one(id: string): Promise<DocumentRecord> {
    const [record] = await presentDocuments(this.db, eq(documents.id, id));
    if (!record) throw notFound('That document');
    return record;
  }
}
