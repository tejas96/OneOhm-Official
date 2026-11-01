import { Inject, Injectable } from '@nestjs/common';
import type { QuotationDetail, QuotationInput } from '@oneohm/api-contracts';
import { leads, quotationLines, quotations } from '@oneohm/database';
import { addDays, formatInr, todayIn } from '@oneohm/shared';
import { and, eq, inArray, like, ne, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { quotationSummaries } from '../../common/read-models/quotation-summary';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { CustomersService } from '../crm/customers.service';
import { loadQuotationDetail } from './quotation-detail';
import { leadForQuotation } from './quotation-lead';
import { QuotationPricingService } from './quotation-pricing.service';

@Injectable()
export class QuotationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pricing: QuotationPricingService,
    private readonly catalog: CatalogService,
    private readonly customers: CustomersService,
  ) {}

  async create(actor: Actor, input: QuotationInput): Promise<QuotationDetail> {
    const property = await this.customers.property(input.propertyId);
    const priced = await this.pricing.price(input);
    const company = await this.catalog.company();
    const today = todayIn();
    const id = await this.db.transaction(async (tx) => {
      const [previous] = await tx
        .select({ id: quotations.id, number: quotations.number, revision: quotations.revision })
        .from(quotations)
        .where(
          and(
            eq(quotations.propertyId, input.propertyId),
            inArray(quotations.status, ['draft', 'sent']),
          ),
        )
        .orderBy(sql`${quotations.revision} desc`)
        .limit(1);
      const number = previous?.number ?? (await this.nextNumber(tx, today));
      if (previous)
        await tx
          .update(quotations)
          .set({ status: 'superseded', updatedAt: new Date() })
          .where(eq(quotations.id, previous.id));
      const totals = priced.preview.totals;
      const leadId = await leadForQuotation(tx, input.leadId, property.customerId);
      const [created] = await tx
        .insert(quotations)
        .values({
          number,
          revision: (previous?.revision ?? 0) + 1,
          previousQuotationId: previous?.id ?? null,
          leadId,
          customerId: property.customerId,
          propertyId: property.id,
          subsidyCategory: input.subsidyCategory,
          systemType: input.systemType,
          targetWp: input.targetWp,
          capacityWp: totals.capacityWp,
          moduleCount: totals.moduleCount,
          panelProductId: input.panelProductId,
          inverterProductId: input.inverterProductId,
          batteryProductId: input.batteryProductId ?? null,
          structureType: input.structureType,
          floors: input.floors,
          distanceKm: input.distanceKm,
          dcCableMeters: input.dcCableMeters ?? null,
          acCableMeters: input.acCableMeters ?? null,
          contingencyBp: priced.rates.contingencyBp,
          toleranceBp: priced.rates.toleranceBp,
          discountPaise: totals.discountPaise,
          discountApprovedByUserId:
            priced.preview.discountNeedsApproval && can(actor, 'quotations.approve_discount')
              ? actor.userId
              : null,
          subtotalPaise: totals.subtotalPaise,
          contingencyPaise: totals.contingencyPaise,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          costPaise: totals.costPaise,
          marginPaise: totals.marginPaise,
          subsidyPaise: totals.subsidyPaise,
          subsidyIneligible: totals.subsidyIneligible,
          effectivePaise: totals.effectivePaise,
          snapshot: {
            rates: priced.rates,
            rule: priced.rule,
            households: input.households ?? null,
            discountNeedsApproval: priced.preview.discountNeedsApproval,
            comparison: priced.preview.comparison,
          },
          validUntil: addDays(today, company.quotationValidityDays),
          createdByUserId: actor.userId,
        })
        .returning({ id: quotations.id });
      if (!created) throw new Error('Quotation insert returned nothing.');
      await tx.insert(quotationLines).values(
        priced.lines.map((line, position) => ({
          quotationId: created.id,
          position,
          key: line.key,
          description: line.description,
          category: line.category,
          quantity: line.quantity,
          unit: line.unit,
          unitPricePaise: line.unitPricePaise,
          unitCostPaise: line.unitCostPaise,
          taxRateBp: line.taxRateBp,
          basis: line.basis,
          amountPaise: line.amountPaise,
          contingencyPaise: line.contingencyPaise,
          discountPaise: line.discountPaise,
          taxPaise: line.taxPaise,
          totalPaise: line.totalPaise,
          costPaise: line.costPaise,
        })),
      );
      if (leadId)
        await tx
          .update(leads)
          .set({ stage: 'quoted', updatedAt: new Date() })
          .where(and(eq(leads.id, leadId), ne(leads.stage, 'won')));
      await recordAudit(tx, actor.userId, 'quotation.created', 'quotation', created.id, {
        number,
        totalPaise: totals.totalPaise,
      });
      return created.id;
    });
    return this.get(id);
  }

  async list(status?: QuotationDetail['status']) {
    return quotationSummaries(this.db, status ? eq(quotations.status, status) : undefined);
  }

  async get(id: string): Promise<QuotationDetail> {
    return loadQuotationDetail(this.db, id);
  }

  async approveDiscount(actor: Actor, id: string): Promise<QuotationDetail> {
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
    await this.db.transaction(async (tx) => {
      await tx
        .update(quotations)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(quotations.id, id));
      await queueWhatsApp(
        tx,
        quotation.customerPhone,
        'quotation_sent',
        {
          customer: quotation.customer.name,
          number: quotation.number,
          total: formatInr(quotation.totalPaise),
          subsidy: formatInr(quotation.subsidyPaise),
          effective: formatInr(quotation.effectivePaise),
        },
        `quotation_sent:${id}`,
      );
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
    await this.db.transaction(async (tx) => {
      await tx
        .update(quotations)
        .set({ status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(quotations.id, id));
      await tx
        .update(quotations)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(
          and(
            eq(quotations.number, quotation.number),
            ne(quotations.id, id),
            inArray(quotations.status, ['draft', 'sent', 'accepted']),
          ),
        );
      if (quotation.input.leadId)
        await tx
          .update(leads)
          .set({ stage: 'won', wonAt: new Date(), updatedAt: new Date() })
          .where(eq(leads.id, quotation.input.leadId));
      await recordAudit(tx, actor.userId, 'quotation.accepted', 'quotation', id, {
        totalPaise: quotation.totalPaise,
      });
    });
    return this.get(id);
  }

  async reject(actor: Actor, id: string, reason: string): Promise<QuotationDetail> {
    await this.db
      .update(quotations)
      .set({ status: 'rejected', rejectedAt: new Date(), updatedAt: new Date() })
      .where(eq(quotations.id, id));
    await recordAudit(this.db, actor.userId, 'quotation.rejected', 'quotation', id, { reason });
    return this.get(id);
  }

  private async nextNumber(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    today: string,
  ): Promise<string> {
    const prefix = `OH-Q-${today.slice(0, 4)}-`;
    const [row] = await tx
      .select({ count: sql<number>`count(distinct ${quotations.number})::int` })
      .from(quotations)
      .where(like(quotations.number, `${prefix}%`));
    return `${prefix}${String((row?.count ?? 0) + 1).padStart(4, '0')}`;
  }
}
