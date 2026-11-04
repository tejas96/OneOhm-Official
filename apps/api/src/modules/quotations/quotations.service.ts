import { Inject, Injectable } from '@nestjs/common';
import type { QuotationDetail, QuotationInput } from '@oneohm/api-contracts';
import { noticeCustomer, quotationInverters, quotationLines, quotations } from '@oneohm/database';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan, can } from '../../common/auth/actor';
import { AppError, conflict } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { quotationSummaries } from '../../common/read-models/quotation-summary';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CatalogService } from '../catalog/catalog.service';
import { CustomersService } from '../crm/customers.service';
import { autoMoveLead, setLeadNextAction } from '../crm/lead-history';
import { changeAwaiting, changeTurnedDown } from '../project-changes/change-close';
import { linkRevision, projectAwaiting, redraftFor, revisionTurnedDown } from './project-revision';
import {
  acceptInTx,
  type CustomerAcceptance,
  customerVerdict,
  tellStartProject,
} from './quotation-accept';
import { loadQuotationDetail } from './quotation-detail';
import { inverterRows } from './quotation-inverters';
import { leadForQuotation } from './quotation-lead';
import { queueQuotePdf, quoteMessage } from './quotation-message';
import { numberFor, type RevisionOf } from './quotation-numbering';
import { QuotationPricingService } from './quotation-pricing.service';
import { lineRows, quotationRow } from './quotation-rows';
import { assertQuoteTypeOffered } from './quote-project-type';
import { freezeQuotedTerms } from './quoted-terms';

/** A sent quote is followed up this many days later (the lead owner's next action). */
const QUOTE_FOLLOW_UP_DAYS = 2;

@Injectable()
export class QuotationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pricing: QuotationPricingService,
    private readonly catalog: CatalogService,
    private readonly customers: CustomersService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  /** `revisionOf` re-prices an accepted quotation (after the survey) under its number. */
  async create(
    actor: Actor,
    input: QuotationInput,
    revisionOf?: RevisionOf,
  ): Promise<QuotationDetail> {
    const property = await this.customers.property(input.propertyId);
    // A survey revision is priced as the accepted quotation was: only measurements move it.
    const priced = revisionOf
      ? await this.pricing.priceAgainst(input, revisionOf.id)
      : await this.pricing.price(input);
    const company = await this.catalog.company();
    const today = todayIn();
    // A project whose survey revision was turned down takes this quote as its next one.
    const redraft = revisionOf ? null : await redraftFor(this.db, input.propertyId);
    // A brand-new quote must be for a project type the owner still offers.
    if (!revisionOf && !redraft) await assertQuoteTypeOffered(this.db, input);
    const id = await this.db.transaction(async (tx) => {
      const slot = await numberFor(tx, input.propertyId, today, revisionOf ?? redraft?.revisionOf);
      const totals = priced.preview.totals;
      const leadId = await leadForQuotation(tx, input.leadId, property.customerId, property.id);
      const [created] = await tx
        .insert(quotations)
        .values(
          quotationRow(input, priced, {
            number: slot.number,
            revision: slot.revision,
            previousQuotationId: slot.previousId,
            leadId,
            customerId: property.customerId,
            propertyId: property.id,
            discountApprovedByUserId:
              priced.preview.discountNeedsApproval && can(actor, 'quotations.approve_discount')
                ? actor.userId
                : null,
            validUntil: addDays(today, company.quotationValidityDays),
            createdByUserId: actor.userId,
          }),
        )
        .returning({ id: quotations.id });
      if (!created) throw new Error('Quotation insert returned nothing.');
      if (redraft) await linkRevision(tx, redraft.projectId, created.id);
      await tx.insert(quotationLines).values(lineRows(created.id, priced));
      await tx.insert(quotationInverters).values(inverterRows(created.id, priced.inverters));
      await recordAudit(tx, actor.userId, 'quotation.created', 'quotation', created.id, {
        number: slot.number,
        revisionOf: revisionOf?.id ?? null,
        totalPaise: totals.totalPaise,
      });
      return created.id;
    });
    return this.get(id);
  }

  /** `scope` narrows the list for people who may only see their own (resellers). */
  async list(status?: QuotationDetail['status'], scope?: SQL) {
    return quotationSummaries(
      this.db,
      and(status ? eq(quotations.status, status) : undefined, scope),
    );
  }

  async get(id: string): Promise<QuotationDetail> {
    return loadQuotationDetail(this.db, id);
  }

  async approveDiscount(actor: Actor, id: string): Promise<QuotationDetail> {
    await this.assertOpen(id);
    await this.db
      .update(quotations)
      .set({ discountApprovedByUserId: actor.userId, updatedAt: new Date() })
      .where(eq(quotations.id, id));
    await recordAudit(this.db, actor.userId, 'quotation.discount_approved', 'quotation', id);
    return this.get(id);
  }

  async send(actor: Actor, id: string): Promise<QuotationDetail> {
    const quotation = await this.get(id);
    if (quotation.discountPendingApproval)
      throw conflict('The discount needs approval before sending.', 'discount_pending');
    if (!['draft', 'sent'].includes(quotation.status))
      throw conflict('Only open quotations can be sent.', 'not_open');
    await this.assertManagerFor(actor, id);
    await assertQuoteTypeOffered(this.db, quotation.input, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(quotations)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(quotations.id, id));
      await freezeQuotedTerms(tx, id);
      // In an open chat the PDF and buttons are the message; the app inbox is told either way.
      const chatted = await queueQuotePdf(tx, this.env, quotation);
      const message = quoteMessage(this.env, quotation);
      const key = `quotation_sent:${id}`;
      if (chatted)
        await noticeCustomer(tx, quotation.customerPhone, 'quotation_sent', message, key);
      else await queueWhatsApp(tx, quotation.customerPhone, 'quotation_sent', message, key);
      if (quotation.input.leadId) {
        const again = quotation.status === 'sent' ? ' again' : '';
        const note = `Quotation ${quotation.number} sent${again}.`;
        await autoMoveLead(tx, quotation.input.leadId, actor.userId, 'quoted', note);
        // "Send again" keeps whatever the owner set since; so does a revision (same note).
        const on = addDays(todayIn(this.env.BUSINESS_TIMEZONE), QUOTE_FOLLOW_UP_DAYS);
        const next = { on, note: `Follow up quote ${quotation.number}`, openOnly: true };
        if (!again) await setLeadNextAction(tx, quotation.input.leadId, actor.userId, next);
      }
      await recordAudit(tx, actor.userId, 'quotation.sent', 'quotation', id);
    });
    return this.get(id);
  }

  /** An accepted revision is locked; later changes need a new revision (PRD 3.5). */
  async accept(actor: Actor, id: string): Promise<QuotationDetail> {
    const quotation = await this.get(id);
    if (quotation.discountPendingApproval)
      throw conflict('The discount needs approval first.', 'discount_pending');
    if (!['draft', 'sent'].includes(quotation.status))
      throw conflict('Only open quotations can be accepted.', 'not_open');
    await this.assertManagerFor(actor, id);
    await assertQuoteTypeOffered(this.db, quotation.input, id);
    await this.db.transaction(async (tx) => {
      const data = { totalPaise: quotation.totalPaise };
      // Accepted a moment ago (by the customer on WhatsApp, say): the same answer as before.
      if (!(await acceptInTx(tx, quotation, actor.userId, data)))
        throw conflict('Only open quotations can be accepted.', 'not_open');
    });
    return this.get(id);
  }

  /**
   * The customer tapped "Yes, accept" on WhatsApp: a binding acceptance by the customer,
   * audited as theirs, with the lead owner and project setup told to start the project.
   */
  async acceptByCustomer(input: {
    customerId: string;
    phoneE164: string;
    quotationId: string;
  }): Promise<CustomerAcceptance> {
    const quotation = await this.get(input.quotationId).catch((error: unknown) => {
      if (error instanceof AppError) return null;
      throw error;
    });
    if (!quotation) return 'not_open';
    if (quotation.customer.id !== input.customerId) return 'not_owner';
    return this.db.transaction(async (tx) => {
      const verdict = await customerVerdict(tx, quotation, input.phoneE164);
      if (verdict !== 'open') return verdict;
      const accepted = await acceptInTx(tx, quotation, null, {
        by: 'customer',
        phone: input.phoneE164,
        channel: 'whatsapp',
        totalPaise: quotation.totalPaise,
      });
      if (!accepted) return 'already';
      await tellStartProject(tx, quotation);
      return 'accepted';
    });
  }

  async reject(actor: Actor, id: string, reason: string): Promise<QuotationDetail> {
    const quotation = await this.assertOpen(id);
    const project = await projectAwaiting(this.db, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(quotations)
        .set({
          status: 'rejected',
          rejectedAt: new Date(),
          rejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(quotations.id, id));
      if (project) await revisionTurnedDown(tx, project, quotation, reason, actor.userId);
      await changeTurnedDown(tx, id, reason, actor.userId);
      await recordAudit(tx, actor.userId, 'quotation.rejected', 'quotation', id, { reason });
    });
    return this.get(id);
  }

  /** Accepted, rejected and replaced quotations are locked (PRD 3.5). */
  private async assertOpen(id: string): Promise<QuotationDetail> {
    const quotation = await this.get(id);
    if (!['draft', 'sent'].includes(quotation.status))
      throw conflict('This quotation is closed. Make a new revision instead.', 'not_open');
    return quotation;
  }

  /** A survey revision needs a project manager to send it and record the customer's OK. */
  private async assertManagerFor(actor: Actor, id: string): Promise<void> {
    if ((await projectAwaiting(this.db, id)) || (await changeAwaiting(this.db, id)))
      assertCan(actor, 'projects.manage');
  }
}
