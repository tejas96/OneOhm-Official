import { Inject, Injectable } from '@nestjs/common';
import type { TaxInvoice } from '@oneohm/api-contracts';
import {
  customerInvoiceLines,
  customerInvoices,
  customers,
  nextInvoiceNumber,
  projectActivities,
  projects,
  type Transaction,
} from '@oneohm/database';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { partiesOf, presentInvoices } from './invoice-parties';
import { invoiceBlocker, invoiceBody, loadInvoiceSource } from './invoice-source';

const BLOCKED = {
  quotation_not_accepted:
    'The project’s quotation is not accepted, so there is nothing to invoice.',
  company_gstin:
    'The company GSTIN in Settings is not valid, so the invoice cannot name its state.',
  property_state_unknown:
    'The site’s state is not a state GST knows. Correct the property’s state, then try again.',
} as const;

/**
 * GST tax invoices (PRD 3.11): one per project for the full price, from the accepted
 * quotation. Issued invoices are fixed; a mistake is cancelled with a reason and a new
 * invoice (new number) is issued. Nothing here posts to the ledger: revenue and GST
 * are booked by the milestones, and any gap is shown, not posted.
 */
@Injectable()
export class InvoicesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(limit: number): Promise<TaxInvoice[]> {
    const rows = await this.query().orderBy(desc(customerInvoices.createdAt)).limit(limit);
    return this.present(rows);
  }

  async forProject(projectId: string): Promise<TaxInvoice[]> {
    const rows = await this.query()
      .where(eq(customerInvoices.projectId, projectId))
      .orderBy(desc(customerInvoices.createdAt));
    return this.present(rows);
  }

  async get(id: string): Promise<TaxInvoice> {
    const [invoice] = await this.present(
      await this.query().where(eq(customerInvoices.id, id)).limit(1),
    );
    if (!invoice) throw notFound('That invoice');
    return invoice;
  }

  async issue(
    actor: Actor,
    projectId: string,
    customerGstin: string | null | undefined,
  ): Promise<TaxInvoice> {
    const id = await this.db.transaction(async (tx) => {
      const invoiceDate = todayIn('Asia/Kolkata');
      const number = await nextInvoiceNumber(tx, invoiceDate);
      await this.ensureNoneIssued(tx, projectId);
      if (customerGstin !== undefined) await this.saveCustomerGstin(tx, projectId, customerGstin);
      const source = await loadInvoiceSource(tx, projectId);
      const blocker = invoiceBlocker(source);
      const body = invoiceBody(source);
      if (blocker || !body || !source.supplier || !source.site) {
        throw invalid(BLOCKED[blocker ?? 'property_state_unknown']);
      }
      const { taxPaise: _tax, ...totals } = body.totals;
      const [previous] = await tx
        .select({ id: customerInvoices.id })
        .from(customerInvoices)
        .where(eq(customerInvoices.projectId, projectId))
        .orderBy(desc(customerInvoices.createdAt))
        .limit(1);
      const [invoice] = await tx
        .insert(customerInvoices)
        .values({
          number,
          projectId,
          quotationId: source.quotation.id,
          customerId: source.customer.id,
          invoiceDate,
          supply: body.supply,
          supplierGstin: source.company?.gstin ?? '',
          supplierStateCode: source.supplier.code,
          customerGstin: source.customer.gstin,
          placeOfSupplyCode: source.site.code,
          placeOfSupplyState: source.site.name,
          ...totals,
          scheduleTotalPaise: source.scheduleTotalPaise,
          parties: partiesOf(source),
          replacesInvoiceId: previous?.id ?? null,
          issuedByUserId: actor.userId,
        })
        .returning({ id: customerInvoices.id });
      if (!invoice) throw new Error('Invoice insert returned nothing.');
      await tx
        .insert(customerInvoiceLines)
        .values(body.lines.map((line, position) => ({ ...line, invoiceId: invoice.id, position })));
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'payment',
        message: `Tax invoice ${number} issued for ${formatInr(body.totals.totalPaise)}.`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'invoice.issued', 'invoice', invoice.id, {
        number,
        totalPaise: body.totals.totalPaise,
      });
      return invoice.id;
    });
    return this.get(id);
  }

  async cancel(actor: Actor, id: string, reason: string): Promise<TaxInvoice> {
    await this.db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(customerInvoices)
        .where(eq(customerInvoices.id, id))
        .for('update')
        .limit(1);
      if (!invoice) throw notFound('That invoice');
      if (invoice.status === 'cancelled') throw conflict('This invoice is already cancelled.');
      await tx
        .update(customerInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledByUserId: actor.userId,
          cancelReason: reason,
        })
        .where(eq(customerInvoices.id, id));
      await tx.insert(projectActivities).values({
        projectId: invoice.projectId,
        kind: 'payment',
        message: `Tax invoice ${invoice.number} cancelled: ${reason}`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'invoice.cancelled', 'invoice', id, { reason });
    });
    return this.get(id);
  }

  private async ensureNoneIssued(tx: Transaction, projectId: string): Promise<void> {
    const [issued] = await tx
      .select({ number: customerInvoices.number })
      .from(customerInvoices)
      .where(and(eq(customerInvoices.projectId, projectId), eq(customerInvoices.status, 'issued')))
      .limit(1);
    if (issued) {
      throw conflict(`Invoice ${issued.number} is already issued. Cancel it to issue a new one.`);
    }
  }

  /** The GSTIN typed on the invoice form is kept on the customer for next time. */
  private async saveCustomerGstin(tx: Transaction, projectId: string, gstin: string | null) {
    const [project] = await tx
      .select({ customerId: projects.customerId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    await tx
      .update(customers)
      .set({ gstin, updatedAt: new Date() })
      .where(eq(customers.id, project.customerId));
  }

  private query() {
    return this.db
      .select({
        invoice: customerInvoices,
        projectCode: projects.code,
        customerName: customers.name,
      })
      .from(customerInvoices)
      .innerJoin(projects, eq(projects.id, customerInvoices.projectId))
      .innerJoin(customers, eq(customers.id, customerInvoices.customerId))
      .$dynamic();
  }

  private async present(rows: Awaited<ReturnType<InvoicesService['query']>>) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.invoice.id);
    const replaced = rows.map((row) => row.invoice.replacesInvoiceId).filter((id) => id !== null);
    const related = await this.db
      .select({
        id: customerInvoices.id,
        number: customerInvoices.number,
        replacesInvoiceId: customerInvoices.replacesInvoiceId,
      })
      .from(customerInvoices)
      .where(
        or(
          and(
            isNotNull(customerInvoices.replacesInvoiceId),
            inArray(customerInvoices.replacesInvoiceId, ids),
          ),
          replaced.length ? inArray(customerInvoices.id, replaced) : undefined,
        ),
      );
    return presentInvoices(this.db, rows, related);
  }
}
