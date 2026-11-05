import {
  customerInvoices,
  type DatabaseExecutor,
  documents,
  reportSettings,
} from '@oneohm/database';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Environment } from '../../config/environment';
import { customerPdfName, paperFileName } from '../reports/pdf-file-name';
import type { Paper } from '../whatsapp/assistant/customer-papers';
import { PAPER_WORDS } from '../whatsapp/assistant/paper-words';
import { sharedFileUrl } from '../whatsapp/file-links';

/** The folders the handover pack takes from: warranty cards, the commissioning papers, the makers' manuals. */
const HANDOVER_FOLDERS = ['warranty', 'commissioning_handover', 'product_manual'];

/** At most this many files go in one pack (each is a chat message). */
const PACK_LIMIT = 8;

export interface PackPaper {
  readonly paper: Paper;
  readonly link: string;
}

/**
 * The papers a customer is handed at the end of a project: warranty cards, handover papers, manuals,
 * the saved Work Completion Report (when the owner shares it with customers) and the tax invoice.
 * Newest first within each; nothing the customer may not see.
 */
export async function handoverPapers(
  db: DatabaseExecutor,
  env: Environment,
  given: { customerId: string; customerName: string; projectId: string },
): Promise<PackPaper[]> {
  const { customerId, projectId } = given;
  const made: PackPaper[] = [];
  const paper = (file: Paper['file'], words: Omit<Paper, 'id' | 'file'>) =>
    made.push({
      paper: { id: `${file.kind}:${file.id}`, file, ...words },
      link: sharedFileUrl(env, file),
    });
  const files = await db
    .select({
      id: documents.id,
      name: documents.name,
      contentType: documents.contentType,
      source: documents.source,
      reportKey: documents.reportKey,
    })
    .from(documents)
    .where(
      and(
        eq(documents.projectId, projectId),
        isNull(documents.removedAt),
        isNull(documents.replacedAt),
        inArray(documents.category, HANDOVER_FOLDERS),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(PACK_LIMIT);
  for (const file of files)
    paper(
      { kind: 'document', id: file.id, customerId },
      {
        title: PAPER_WORDS.paper(file.name),
        filename: paperFileName(file.name, file.contentType),
        caption: file.name,
      },
    );
  const [report] = await db
    .select({ id: documents.id, name: documents.name })
    .from(documents)
    .where(
      and(
        eq(documents.projectId, projectId),
        eq(documents.source, 'report'),
        eq(documents.reportKey, 'wcr'),
        isNull(documents.removedAt),
        isNull(documents.replacedAt),
      ),
    )
    .limit(1);
  const [shared] = await db.select().from(reportSettings).where(eq(reportSettings.key, 'wcr'));
  if (report && shared?.customerVisible !== false)
    paper(
      { kind: 'report', id: projectId, customerId, key: 'wcr' },
      {
        title: PAPER_WORDS.paper(report.name),
        filename: paperFileName(report.name, 'application/pdf'),
        caption: report.name,
      },
    );
  const [invoice] = await db
    .select({ id: customerInvoices.id, number: customerInvoices.number })
    .from(customerInvoices)
    .where(and(eq(customerInvoices.projectId, projectId), eq(customerInvoices.status, 'issued')))
    .orderBy(desc(customerInvoices.createdAt))
    .limit(1);
  if (invoice)
    paper(
      { kind: 'invoice', id: invoice.id, customerId },
      {
        title: PAPER_WORDS.invoice,
        filename: customerPdfName(given.customerName, 'invoice'),
        caption: PAPER_WORDS.invoiceCaption(invoice.number),
      },
    );
  return made.slice(0, PACK_LIMIT);
}
