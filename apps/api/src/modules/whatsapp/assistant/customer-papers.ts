import {
  customers,
  type Database,
  paymentMilestones,
  payments,
  projects,
  quotations,
} from '@oneohm/database';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { CustomerDocumentsService } from '../../customer-portal/customer-documents.service';
import type { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { QUOTE_MONEY_WORDS } from '../../quotations/quote-money-words';
import { customerPdfName, paperFileName } from '../../reports/pdf-file-name';
import type { SharedFile } from '../file-links';
import { issuedInvoices } from '../shared-invoices';
import { PAPER_WORDS } from './paper-words';
import { plainDate } from './plain-date';
import { PROJECT_WORDS } from './project-words';

const TIME_ZONE = 'Asia/Kolkata';

/** Each kind of paper shows its newest few. */
const LATEST = 3;

/** One paper the customer can ask for: a list row, and the file it sends. */
export interface Paper {
  /** The row's tap id, `paper:<kind>:<id>` (a report adds `:<key>`). */
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly file: Omit<SharedFile, 'exp'>;
  readonly filename: string;
  readonly caption: string;
}

const TAP =
  /^paper:(quotation|receipt|invoice|report|document):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-z][a-z0-9-]{1,59})?$/;

/** True for a tap on one of the customer's papers. */
export const isPaperTap = (choiceId: string | null | undefined) => TAP.test(choiceId ?? '');

/** The tap id for one paper; "View receipt" after a payment uses it too. */
export const paperTap = (kind: SharedFile['kind'], id: string, key?: string) =>
  `paper:${kind}:${id}${key ? `:${key}` : ''}`;

interface Sources {
  readonly db: Database;
  readonly portal: CustomerPortalService;
  readonly documents: CustomerDocumentsService;
}

/**
 * The customer's papers in the language being spoken (live QA round 2): the quotation,
 * each receipt, the tax invoices, ready reports and other customer papers, newest first.
 */
export async function customerPapers(sources: Sources, customerId: string): Promise<Paper[]> {
  const { db, portal, documents } = sources;
  const [customer] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId));
  const name = customer?.name ?? '';
  const paper = (
    kind: SharedFile['kind'],
    id: string,
    words: Omit<Paper, 'id' | 'file'>,
    key?: string,
  ): Paper => ({
    id: paperTap(kind, id, key),
    file: { kind, id, customerId, ...(key ? { key } : {}) },
    ...words,
  });
  const { projects: own } = await portal.home(customerId);
  const ids = own.map((project) => project.quotation.id);
  const revisions = ids.length
    ? await db
        .select({ id: quotations.id, revision: quotations.revision })
        .from(quotations)
        .where(inArray(quotations.id, ids))
    : [];
  const projectQuotes = own.map((project) => ({
    ...project.quotation,
    place: project.place,
    revision: revisions.find((row) => row.id === project.quotation.id)?.revision ?? 1,
    sentAt: null,
  }));
  const quotes = [...projectQuotes, ...(await sentQuotes(db, customerId, projectQuotes))];
  const reports = (await documents.readyReports(customerId)).slice(0, LATEST);
  const papers = (await documents.list(customerId))
    .filter((entry) => entry.category !== 'site_photo')
    .slice(0, LATEST);
  return [
    ...quotes.map((quote) =>
      paper('quotation', quote.id, {
        title: PAPER_WORDS.quote,
        // On a project: its town. Not on one yet: when it was sent, and whether revised.
        description: quote.place
          ? PROJECT_WORDS.projectIn(quote.place)
          : PAPER_WORDS.quoteSent(
              quote.revision > 1,
              plainDate(todayIn(TIME_ZONE, quote.sentAt ?? new Date())),
            ),
        filename: customerPdfName(name, 'quote', quote.revision),
        caption: QUOTE_MONEY_WORDS.caption(quote.number),
      }),
    ),
    ...(await receipts(db, customerId)).map((receipt) =>
      paper('receipt', receipt.id, {
        title: receipt.instalment
          ? PAPER_WORDS.receipt(receipt.instalment)
          : PAPER_WORDS.plainReceipt,
        description: PAPER_WORDS.paid(formatInr(receipt.amount), plainDate(receipt.on)),
        filename: customerPdfName(name, 'receipt'),
        caption: PROJECT_WORDS.receiptCaption(receipt.number ?? ''),
      }),
    ),
    ...(await issuedInvoices(db, customerId, LATEST)).map((invoice) =>
      paper('invoice', invoice.id, {
        title: PAPER_WORDS.invoice,
        description: formatInr(invoice.totalPaise),
        filename: customerPdfName(name, 'invoice'),
        caption: PAPER_WORDS.invoiceCaption(invoice.number),
      }),
    ),
    ...reports.map((report) =>
      paper(
        'report',
        report.projectId,
        {
          title: PAPER_WORDS.paper(report.name),
          filename: paperFileName(report.name, 'application/pdf'),
          caption: report.name,
        },
        report.key,
      ),
    ),
    ...papers.map((entry) =>
      paper('document', entry.id, {
        title: PAPER_WORDS.paper(entry.name),
        filename: paperFileName(entry.name, entry.contentType),
        caption: entry.name,
      }),
    ),
  ];
}

/** The newest receipts, each with its instalment ("1st instalment", "Bank loan"). */
async function receipts(db: Database, customerId: string) {
  const rows = await db
    .select({
      id: payments.id,
      number: payments.receiptNumber,
      amount: payments.amountPaise,
      on: payments.receivedOn,
      payer: paymentMilestones.payer,
      index: sql<number>`(select count(*) from ${paymentMilestones} m where m.project_id = ${paymentMilestones.projectId} and m.payer = 'customer' and m.position < ${paymentMilestones.position})::int`,
      count: sql<number>`(select count(*) from ${paymentMilestones} m where m.project_id = ${paymentMilestones.projectId} and m.payer = 'customer')::int`,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .leftJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
    .where(and(eq(projects.customerId, customerId), isNotNull(payments.receiptNumber)))
    .orderBy(desc(payments.createdAt))
    .limit(LATEST);
  return rows.map((row) => ({
    ...row,
    instalment:
      row.payer === 'bank'
        ? PROJECT_WORDS.bankShare
        : row.payer
          ? PROJECT_WORDS.instalment(Number(row.index), Number(row.count))
          : null,
  }));
}

/** The newest sent or accepted revision of each quotation not already shown with a project. */
async function sentQuotes(db: Database, customerId: string, shown: readonly { number: string }[]) {
  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      revision: quotations.revision,
      sentAt: quotations.sentAt,
    })
    .from(quotations)
    .where(
      and(eq(quotations.customerId, customerId), inArray(quotations.status, ['sent', 'accepted'])),
    )
    .orderBy(desc(quotations.revision), desc(quotations.createdAt));
  const seen = new Set(shown.map((quote) => quote.number));
  return rows
    .filter((row) => !seen.has(row.number) && seen.add(row.number))
    .slice(0, LATEST)
    .map((row) => ({ ...row, place: null }));
}
