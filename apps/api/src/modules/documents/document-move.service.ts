import { Inject, Injectable } from '@nestjs/common';
import type { DocumentHome, DocumentRecord, MoveDocument } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents, projectActivities, projects } from '@oneohm/database';
import { isCustomerDocumentCategory, isPersonDocumentCategory } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { customerHomes } from '../customer-portal/customer-homes';
import { canUploadDocuments } from './document-access';
import { logOnHomeLead, settleAnsweredRequests } from './document-move-requests';
import { presentDocuments } from './document-read';
import { closeRequestWithUpload } from './request-received';

interface Target {
  readonly projectId: string | null;
  readonly propertyId: string | null;
  readonly name: string | null;
}

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
    const { projectId, propertyId, name } = target;
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
      const message = `Paper moved: ${paper.name} → ${name ?? 'no home (ID / income papers)'}`;
      const onProjects = new Set([paper.projectId, projectId].filter((one) => one !== null));
      for (const onProject of onProjects)
        await tx.insert(projectActivities).values({
          projectId: onProject,
          kind: 'document',
          message,
          userId: actor.userId,
          data: { documentId: id, from: paper.category, to: category },
        });
      // A lead-only home has no project to log on: its open lead keeps the line instead.
      if (!projectId && propertyId) await logOnHomeLead(tx, propertyId, actor.userId, message);
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
        propertyId,
        category,
      });
    });
    return this.one(id);
  }

  /**
   * The project must be the same customer's; a lead-only home must be one of their homes;
   * no home only for a person's paper. `name` is how the logs name the new place.
   */
  private async targetOf(customerId: string, input: MoveDocument): Promise<Target> {
    if (input.projectId) return this.projectTarget(customerId, input.projectId);
    if (input.propertyId) {
      const home = (await customerHomes(this.db, customerId)).find(
        (one) => one.propertyId === input.propertyId,
      );
      if (!home) throw conflict("That home is not one of this customer's.", 'other_customer');
      if (home.projectId) return this.projectTarget(customerId, home.projectId);
      return { projectId: null, propertyId: home.propertyId, name: home.title };
    }
    if (!isPersonDocumentCategory(input.category)) {
      throw invalid('Choose the home this paper belongs to.', { projectId: 'Required.' });
    }
    return { projectId: null, propertyId: null, name: null };
  }

  private async projectTarget(customerId: string, projectId: string): Promise<Target> {
    const [project] = await this.db
      .select({
        customerId: projects.customerId,
        propertyId: projects.propertyId,
        code: projects.code,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    if (project.customerId !== customerId) {
      throw conflict("That project is another customer's.", 'other_customer');
    }
    return { projectId, propertyId: project.propertyId, name: project.code };
  }

  /**
   * The customer takes back where their WhatsApp papers went ([Change], redesign 5.2): each
   * goes back to "not filed", in the caller's transaction, logged and audited like a move.
   * A request a paper answered is asked again without telling the customer (they did it
   * themselves). A paper the team already checked is left alone. Returns the ones released.
   */
  async release(
    tx: DatabaseExecutor,
    customerId: string,
    documentIds: readonly string[],
  ): Promise<string[]> {
    const released: string[] = [];
    for (const id of documentIds) {
      const [paper] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, id), eq(documents.customerId, customerId)));
      if (!paper || paper.removedAt || paper.replacedAt || paper.checkedAt) continue;
      await tx
        .update(documents)
        .set({ projectId: null, propertyId: null, category: 'other' })
        .where(eq(documents.id, id));
      if (paper.projectId)
        await tx.insert(projectActivities).values({
          projectId: paper.projectId,
          kind: 'document',
          message: `Paper moved: ${paper.name} → the customer is changing what it is`,
          userId: null,
          data: { documentId: id, from: paper.category, to: 'other' },
        });
      await recordAudit(tx, null, 'document.moved', 'document', id, {
        via: 'whatsapp',
        from: {
          projectId: paper.projectId,
          propertyId: paper.propertyId,
          category: paper.category,
        },
        to: { projectId: null, propertyId: null, category: 'other' },
      });
      await settleAnsweredRequests(tx, null, id, { propertyId: null, category: 'other' }, true);
      released.push(id);
    }
    return released;
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
