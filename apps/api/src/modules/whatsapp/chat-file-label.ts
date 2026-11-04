import { type DatabaseExecutor, documents, homeName, properties } from '@oneohm/database';
import { type DocumentCategory, isPersonDocumentCategory } from '@oneohm/domain';
import { eq } from 'drizzle-orm';

/** The folder names the Documents screen shows (apps/web documents.json, categories). */
const KIND_LABELS: Readonly<Record<DocumentCategory, string>> = {
  site_photo: 'Site photo',
  site_survey: 'Site survey',
  customer_kyc: 'Customer ID and KYC',
  electricity_bill: 'Electricity bill',
  property: 'Property papers',
  quotation: 'Quotation',
  invoice_receipt: 'Invoice or receipt',
  vendor: 'Vendor document',
  contractor: 'Contractor papers',
  dcr_certificate: 'DCR certificate',
  bank_loan: 'Bank and loan',
  discom: 'DISCOM',
  subsidy: 'Subsidy',
  income_proof: 'Income proof',
  commissioning_handover: 'Commissioning and handover',
  warranty: 'Warranty',
  product_manual: 'Product manuals',
  statutory_report: 'Statutory report',
  other: 'Other',
};

/** The columns of a chat file that tell where it was filed. */
export const chatFileColumns = {
  id: documents.id,
  name: documents.name,
  contentType: documents.contentType,
  category: documents.category,
  projectId: documents.projectId,
  propertyId: documents.propertyId,
  serviceRequestId: documents.serviceRequestId,
  leadId: documents.leadId,
};

type Home = Parameters<typeof homeName>[0];
/** A left-joined document; the whole row is null when the message has no file. */
interface FileRow {
  readonly id: string | null;
  readonly name: string | null;
  readonly contentType: string | null;
  readonly category: string | null;
  readonly projectId: string | null;
  readonly propertyId: string | null;
  readonly serviceRequestId: string | null;
  readonly leadId: string | null;
}

/** The customer's properties: a home's name needs them to tell two of the same name apart. */
export async function homesOf(db: DatabaseExecutor, customerId: string | null): Promise<Home[]> {
  if (!customerId) return [];
  return db
    .select({
      propertyId: properties.id,
      label: properties.label,
      city: properties.city,
      consumerNumber: properties.consumerNumber,
    })
    .from(properties)
    .where(eq(properties.customerId, customerId));
}

/**
 * Where a chat file was filed: "Electricity bill · Pune", the folder alone for ID papers
 * (they serve every home), "Electricity bill · Lead" for a lead's file with no home yet,
 * null while it is still to sort.
 */
export function filedAs(file: FileRow, homes: readonly Home[]): string | null {
  const category = file.category ?? 'other';
  const filed = file.projectId || file.propertyId || file.serviceRequestId || file.leadId;
  if (category === 'other' && !filed) return null;
  const kind = KIND_LABELS[category as DocumentCategory] ?? category;
  const home =
    file.propertyId && !isPersonDocumentCategory(category)
      ? homes.find((one) => one.propertyId === file.propertyId)
      : undefined;
  if (home) return `${kind} · ${homeName(home, homes)}`;
  const onLead = file.leadId && !file.projectId && !file.propertyId;
  return onLead && !isPersonDocumentCategory(category) ? `${kind} · Lead` : kind;
}

/** The file as the chat shows it; null when the message has none. */
export function chatFile(file: FileRow | null, homes: readonly Home[]) {
  if (!file?.id) return null;
  return {
    id: file.id,
    name: file.name ?? '',
    contentType: file.contentType ?? '',
    filedAs: filedAs(file, homes),
  };
}
