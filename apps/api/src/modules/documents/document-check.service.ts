import { Inject, Injectable } from '@nestjs/common';
import type { DocumentRecord } from '@oneohm/api-contracts';
import { customerActions, customers, documents, type Transaction } from '@oneohm/database';
import { isCustomerRequestable, nextActionStatus } from '@oneohm/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { signedCopyChecked } from '../journey/journey-signature';
import { loanPapersChecked } from '../journey/loan-papers';
import { logAction } from './customer-action-log';
import { canUploadDocuments } from './document-access';
import { presentDocuments } from './document-read';
import { reaskCount } from './document-request-home';
import { languageOfPhone, tellChecked } from './document-request-messages';
import { paperKindWords } from './paper-kind-words';

/**
 * "Looks good": the team has looked at a paper the customer sent (redesign §5.3). The
 * paper is checked; the request it answers closes; the customer is told in the app and,
 * while their chat is open, on WhatsApp. Checking twice changes nothing.
 */
@Injectable()
export class DocumentCheckService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async check(actor: Actor, id: string): Promise<DocumentRecord> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const [paper] = await this.db
      .select({ name: documents.name, checkedAt: documents.checkedAt })
      .from(documents)
      .where(and(eq(documents.id, id), isNull(documents.removedAt), isNull(documents.replacedAt)));
    if (!paper) throw notFound('That document');
    if (!paper.checkedAt) await this.db.transaction((tx) => this.markChecked(tx, actor, id));
    const [record] = await presentDocuments(this.db, eq(documents.id, id));
    if (!record) throw notFound('That document');
    return record;
  }

  private async markChecked(tx: Transaction, actor: Actor, id: string) {
    const now = new Date();
    const [done] = await tx
      .update(documents)
      .set({ checkedAt: now, checkedByUserId: actor.userId })
      .where(and(eq(documents.id, id), isNull(documents.checkedAt)))
      .returning({ id: documents.id });
    if (!done) return;
    await recordAudit(tx, actor.userId, 'document.checked', 'document', id);
    const answered = await tx
      .select({ action: customerActions, phone: customers.phoneE164 })
      .from(customerActions)
      .innerJoin(customers, eq(customers.id, customerActions.customerId))
      .where(
        and(
          eq(customerActions.documentId, id),
          eq(customerActions.type, 'paper'),
          inArray(customerActions.status, ['received']),
        ),
      );
    for (const { action, phone } of answered) {
      if (nextActionStatus(action.type, action.status, 'looks_good') !== 'closed') continue;
      await tx
        .update(customerActions)
        .set({ status: 'closed', closedAt: now, updatedAt: now })
        .where(and(eq(customerActions.id, action.id), eq(customerActions.status, 'received')));
      await logAction(tx, action, {
        kind: 'document_request',
        message: `${action.title} checked`,
        userId: actor.userId,
        data: { customerActionId: action.id, documentId: id },
      });
      await recordAudit(tx, actor.userId, 'customer_action.checked', 'customer_action', action.id, {
        documentId: id,
      });
      await tellChecked(
        tx,
        { id: action.id, title: action.title, phone },
        await reaskCount(tx, action.id),
        actor.userId,
      );
      // The signed copy of a paper the customer agreed to: agreed and checked, so the ask is done.
      const signature = action.payload.signatureActionId;
      if (typeof signature === 'string') await signedCopyChecked(tx, signature, id, actor.userId);
      await loanPapersChecked(tx, action);
    }
    if (answered.length === 0) await this.tellUnasked(tx, actor, id);
  }

  /** A paper nobody asked for (sent on its own) is checked too: the customer hears it. */
  private async tellUnasked(tx: Transaction, actor: Actor, id: string) {
    const [paper] = await tx
      .select({ category: documents.category, phone: customers.phoneE164 })
      .from(documents)
      .innerJoin(customers, eq(customers.id, documents.customerId))
      .where(eq(documents.id, id));
    // Only a paper the customer holds is told about; our own files and strays are not.
    if (!paper || paper.category === 'other' || !isCustomerRequestable(paper.category)) return;
    const title = paperKindWords(await languageOfPhone(tx, paper.phone), paper.category);
    await tellChecked(tx, { id, title, phone: paper.phone }, 0, actor.userId);
  }
}
