import type { InvoiceDraft } from '@oneohm/api-contracts';
import {
  companyProfile,
  customers,
  type DatabaseExecutor,
  paymentMilestones,
  products,
  projects,
  properties,
  quotationLines,
  quotations,
} from '@oneohm/database';
import {
  buildTaxInvoice,
  type GstState,
  gstStateByName,
  gstStateFromGstin,
  type InvoiceLineInput,
  isValidGstin,
  scheduleDifference,
  stateLabel,
  supplyTypeFor,
  type TaxInvoiceBody,
} from '@oneohm/domain';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';

/** Everything one project's tax invoice is made from, read in one place. */
export interface InvoiceSource {
  readonly project: typeof projects.$inferSelect;
  readonly quotation: typeof quotations.$inferSelect;
  readonly customer: typeof customers.$inferSelect;
  readonly property: typeof properties.$inferSelect;
  readonly company: typeof companyProfile.$inferSelect | null;
  readonly supplier: GstState | null;
  readonly site: GstState | null;
  readonly lines: readonly InvoiceLineInput[];
  readonly scheduleTotalPaise: number;
}

/** Catalog products behind quotation lines: the panel, inverter and battery picks. */
async function codesByLineKey(
  db: DatabaseExecutor,
  quotation: typeof quotations.$inferSelect,
): Promise<Map<string, string | null>> {
  const picks: [string, string | null][] = [
    ['panel', quotation.panelProductId],
    ['inverter', quotation.inverterProductId],
    ['battery', quotation.batteryProductId],
  ];
  const ids = picks.map(([, id]) => id).filter((id): id is string => id !== null);
  const rows = ids.length
    ? await db
        .select({ id: products.id, hsnSac: products.hsnSac })
        .from(products)
        .where(inArray(products.id, ids))
    : [];
  return new Map(
    picks.map(([key, id]) => [key, rows.find((row) => row.id === id)?.hsnSac ?? null]),
  );
}

export async function loadInvoiceSource(
  db: DatabaseExecutor,
  projectId: string,
): Promise<InvoiceSource> {
  const [row] = await db
    .select({ project: projects, quotation: quotations, customer: customers, property: properties })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) throw notFound('That project');
  const priced = await db
    .select()
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, row.quotation.id))
    .orderBy(asc(quotationLines.position));
  const codes = await codesByLineKey(db, row.quotation);
  const [profile] = await db.select().from(companyProfile).limit(1);
  const [schedule] = await db
    .select({ total: sql<string>`coalesce(sum(${paymentMilestones.amountPaise}), 0)` })
    .from(paymentMilestones)
    .where(eq(paymentMilestones.projectId, projectId));
  const gstin = profile?.gstin ?? '';
  return {
    ...row,
    company: profile ?? null,
    supplier: isValidGstin(gstin) ? gstStateFromGstin(gstin) : null,
    site: gstStateByName(row.property.state),
    lines: priced.map((line) => ({
      description: line.description,
      hsnSac: codes.get(line.key) ?? null,
      quantity: line.quantity,
      unit: line.unit,
      amountPaise: line.amountPaise,
      contingencyPaise: line.contingencyPaise,
      discountPaise: line.discountPaise,
      taxRateBp: line.taxRateBp,
      taxPaise: line.taxPaise,
    })),
    scheduleTotalPaise: Number(schedule?.total ?? 0),
  };
}

export function invoiceBlocker(source: InvoiceSource): InvoiceDraft['blocker'] {
  if (source.quotation.status !== 'accepted') return 'quotation_not_accepted';
  if (!source.supplier) return 'company_gstin';
  if (!source.site) return 'property_state_unknown';
  return null;
}

/** The invoice body for the source, when its states are known. */
export function invoiceBody(source: InvoiceSource): TaxInvoiceBody | null {
  if (!source.supplier || !source.site) return null;
  return buildTaxInvoice(source.lines, supplyTypeFor(source.supplier.code, source.site.code));
}

const EMPTY = { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0 };

/** What issuing now would produce: shown before finance commits to a number. */
export function invoiceDraft(source: InvoiceSource): InvoiceDraft {
  const body = invoiceBody(source);
  const totals = body?.totals ?? EMPTY;
  return {
    blocker: invoiceBlocker(source),
    supply: body?.supply ?? null,
    placeOfSupply: source.site ? stateLabel(source.site) : null,
    customerGstin: source.customer.gstin,
    lineCount: source.lines.length,
    linesWithoutCode: source.lines.filter((line) => !line.hsnSac?.trim()).length,
    taxablePaise: totals.taxablePaise,
    cgstPaise: totals.cgstPaise,
    sgstPaise: totals.sgstPaise,
    igstPaise: totals.igstPaise,
    totalPaise: totals.totalPaise,
    scheduleTotalPaise: source.scheduleTotalPaise,
    differencePaise: scheduleDifference(totals.totalPaise, source.scheduleTotalPaise),
  };
}
