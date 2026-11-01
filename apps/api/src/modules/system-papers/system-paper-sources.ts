import {
  customerInvoices,
  type DatabaseExecutor,
  documents,
  payments,
  projects,
  quotations,
  workOrders,
} from '@oneohm/database';
import {
  paperVersion,
  readSystemPaperKey,
  type SystemPaperKind,
  systemPaperKey,
} from '@oneohm/domain';
import { and, eq, isNotNull, isNull, like, type SQL, sql } from 'drizzle-orm';

/** Which papers to look at: one project's, one customer's, one contractor's, or all. */
export interface PaperScope {
  readonly projectId?: string | undefined;
  readonly customerId?: string | undefined;
  readonly contractorId?: string | undefined;
}

/** A paper that should be on file, with the links its document gets. */
export interface WantedPaper {
  readonly kind: SystemPaperKind;
  readonly sourceId: string;
  readonly key: string;
  readonly name: string;
  readonly projectId: string | null;
  readonly customerId: string;
  readonly propertyId: string | null;
  readonly leadId: string | null;
  readonly contractorId: string | null;
}

/** A filed system paper's current row (or the last one someone took off the list). */
export interface FiledPaper {
  readonly id: string;
  readonly key: string;
  readonly removed: boolean;
  readonly projectId: string | null;
}

const all = (parts: (SQL | undefined)[]) => and(...parts.filter(Boolean)) as SQL | undefined;

async function acceptedQuotations(db: DatabaseExecutor, scope: PaperScope): Promise<WantedPaper[]> {
  if (scope.contractorId) return [];
  const rows = await db
    .select({ quotation: quotations, projectId: projects.id })
    .from(quotations)
    .leftJoin(projects, eq(projects.quotationId, quotations.id))
    .where(
      all([
        eq(quotations.status, 'accepted'),
        scope.projectId ? eq(projects.id, scope.projectId) : undefined,
        scope.customerId ? eq(quotations.customerId, scope.customerId) : undefined,
      ]),
    );
  return rows.map(({ quotation, projectId }) => ({
    kind: 'quotation',
    sourceId: quotation.id,
    key: systemPaperKey('quotation', quotation.id, 'accepted'),
    name: `Quotation ${quotation.number}${quotation.revision > 1 ? ` (revision ${quotation.revision})` : ''}.pdf`,
    projectId,
    customerId: quotation.customerId,
    propertyId: quotation.propertyId,
    leadId: quotation.leadId,
    contractorId: null,
  }));
}

async function taxInvoices(db: DatabaseExecutor, scope: PaperScope): Promise<WantedPaper[]> {
  if (scope.contractorId) return [];
  const rows = await db
    .select({ invoice: customerInvoices, propertyId: projects.propertyId })
    .from(customerInvoices)
    .innerJoin(projects, eq(projects.id, customerInvoices.projectId))
    .where(
      all([
        scope.projectId ? eq(customerInvoices.projectId, scope.projectId) : undefined,
        scope.customerId ? eq(customerInvoices.customerId, scope.customerId) : undefined,
      ]),
    );
  return rows.map(({ invoice, propertyId }) => ({
    kind: 'invoice',
    sourceId: invoice.id,
    // A cancelled invoice prints "Cancelled", so it is filed again.
    key: systemPaperKey('invoice', invoice.id, invoice.status),
    name: `Tax invoice ${invoice.number}.pdf`,
    projectId: invoice.projectId,
    customerId: invoice.customerId,
    propertyId,
    leadId: null,
    contractorId: null,
  }));
}

async function receipts(db: DatabaseExecutor, scope: PaperScope): Promise<WantedPaper[]> {
  if (scope.contractorId) return [];
  const reversed = sql<boolean>`exists (select 1 from payments r where r.reverses_payment_id = ${payments.id})`;
  const rows = await db
    .select({
      id: payments.id,
      number: payments.receiptNumber,
      projectId: payments.projectId,
      customerId: projects.customerId,
      propertyId: projects.propertyId,
      reversed,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .where(
      all([
        isNotNull(payments.receiptNumber),
        isNull(payments.reversesPaymentId),
        scope.projectId ? eq(payments.projectId, scope.projectId) : undefined,
        scope.customerId ? eq(projects.customerId, scope.customerId) : undefined,
      ]),
    );
  return rows.map((row) => ({
    kind: 'receipt',
    sourceId: row.id,
    // A reversed payment's receipt prints "Cancelled", so it is filed again.
    key: systemPaperKey('receipt', row.id, row.reversed ? 'reversed' : 'issued'),
    name: `Receipt ${row.number}.pdf`,
    projectId: row.projectId,
    customerId: row.customerId,
    propertyId: row.propertyId,
    leadId: null,
    contractorId: null,
  }));
}

async function issuedWorkOrders(db: DatabaseExecutor, scope: PaperScope): Promise<WantedPaper[]> {
  const rows = await db
    .select({ order: workOrders, customerId: projects.customerId, propertyId: projects.propertyId })
    .from(workOrders)
    .innerJoin(projects, eq(projects.id, workOrders.projectId))
    .where(
      all([
        scope.projectId ? eq(workOrders.projectId, scope.projectId) : undefined,
        scope.customerId ? eq(projects.customerId, scope.customerId) : undefined,
        scope.contractorId ? eq(workOrders.contractorId, scope.contractorId) : undefined,
      ]),
    );
  return rows.map(({ order, customerId, propertyId }) => ({
    kind: 'work_order',
    sourceId: order.id,
    // What the printed order shows: its status, dates, scope and money.
    key: systemPaperKey(
      'work_order',
      order.id,
      paperVersion([
        order.status,
        order.dueDate,
        order.scope,
        order.cancelledReason,
        order.grossPaise,
        order.reworkDeductionsPaise,
        order.retentionPaise,
        order.tdsPaise,
        order.advancesPaise,
        order.netPayablePaise,
      ]),
    ),
    name: `Work order ${order.number}.pdf`,
    projectId: order.projectId,
    customerId,
    propertyId,
    leadId: null,
    contractorId: order.contractorId,
  }));
}

/** Every system paper in the scope that should be on file. */
export async function wantedPapers(db: DatabaseExecutor, scope: PaperScope) {
  return [
    ...(await acceptedQuotations(db, scope)),
    ...(await taxInvoices(db, scope)),
    ...(await receipts(db, scope)),
    ...(await issuedWorkOrders(db, scope)),
  ];
}

/** The latest filed copy of each system paper, by `kind:source id`. */
export async function filedPapers(db: DatabaseExecutor): Promise<Map<string, FiledPaper>> {
  const rows = await db
    .select({
      id: documents.id,
      key: documents.storageKey,
      removedAt: documents.removedAt,
      projectId: documents.projectId,
    })
    .from(documents)
    .where(
      and(
        eq(documents.source, 'system'),
        like(documents.storageKey, 'system/%'),
        isNull(documents.replacedAt),
      ),
    );
  const filed = new Map<string, FiledPaper>();
  for (const row of rows) {
    const ref = readSystemPaperKey(row.key);
    if (!ref) continue;
    const id = `${ref.kind}:${ref.sourceId}`;
    // A current copy wins over one someone took off the list.
    if (filed.get(id)?.removed === false) continue;
    filed.set(id, {
      id: row.id,
      key: row.key,
      removed: row.removedAt !== null,
      projectId: row.projectId,
    });
  }
  return filed;
}
