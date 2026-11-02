import { Inject, Injectable } from '@nestjs/common';
import { paymentMilestones, payments, projects, quotations } from '@oneohm/database';
import { formatInr, formatKwp } from '@oneohm/shared';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { daySpan } from '../../../common/notices';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerAfterSalesService } from '../../after-sales/customer-after-sales.service';
import { CustomerDocumentsService } from '../../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { openLinksFor } from '../../online-payments/open-links';
import { PaymentLinksService } from '../../online-payments/payment-links.service';
import { type SharedFile, sharedFileUrl } from '../file-links';
import { issuedInvoices } from '../shared-invoices';
import { coverText } from './cover-answer';
import { fitMessage } from './fit-message';
import { rewardsText } from './rewards-answer';
import { ANSWER_WORDS, FILE_WORDS, WORDS } from './words';

const list = (lines: readonly string[]) => lines.filter(Boolean).join('\n');

/** Each kind of file in the "Documents" answer shows its newest few. */
const LATEST = 3;

/** The assistant's answers, each built from the customer's live records. */
@Injectable()
export class AnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly papers: CustomerDocumentsService,
    private readonly links: PaymentLinksService,
    private readonly after: CustomerAfterSalesService,
  ) {}

  async progress(customerId: string): Promise<string> {
    const { projects: own } = await this.portal.home(customerId);
    if (own.length === 0) return WORDS.noProject;
    return own
      .map((project) => {
        const done = project.stages.filter((stage) => stage.state === 'done').length;
        const steps = project.stages.filter((stage) => stage.state !== 'skipped').length;
        return list([
          `*${project.code}* · ${formatKwp(project.capacityWp)} · ${project.place}`,
          ANSWER_WORDS.now(WORDS.stage[project.currentStage] ?? project.currentStage, done, steps),
          project.nextStep
            ? ANSWER_WORDS.next(
                project.nextStep.title,
                daySpan(project.nextStep.date, project.nextStep.date),
              )
            : '',
          project.waiting
            ? ANSWER_WORDS.waitingSince(
                WORDS.waitingOn[project.waiting.party] ?? '',
                daySpan(project.waiting.since, project.waiting.since),
              )
            : '',
          WORDS.subsidy[project.subsidy.status] ?? '',
        ]);
      })
      .join('\n\n');
  }

  /** What is paid and due, with a pay link for each due amount (made when needed). */
  async payments(customerId: string): Promise<string> {
    const own = await this.db
      .select({ id: projects.id, code: projects.code })
      .from(projects)
      .where(eq(projects.customerId, customerId));
    if (own.length === 0) return WORDS.noProject;
    const milestones = await this.db
      .select()
      .from(paymentMilestones)
      .where(
        inArray(
          paymentMilestones.projectId,
          own.map((project) => project.id),
        ),
      )
      .orderBy(paymentMilestones.position);
    const paid = await this.db
      .select({ milestoneId: payments.milestoneId, amount: payments.amountPaise })
      .from(payments)
      .where(
        inArray(
          payments.projectId,
          own.map((project) => project.id),
        ),
      );
    const open = await openLinksFor(
      this.db,
      milestones.map((milestone) => milestone.id),
    );
    const online = this.links.setup().mode !== 'off';
    const blocks: string[] = [];
    for (const project of own) {
      const lines = [`*${project.code}*`];
      for (const milestone of milestones.filter((row) => row.projectId === project.id)) {
        const got = paid
          .filter((row) => row.milestoneId === milestone.id)
          .reduce((sum, row) => sum + row.amount, 0);
        lines.push(
          await this.milestoneLine(milestone, got, open.get(milestone.id)?.url ?? null, online),
        );
      }
      blocks.push(list(lines));
    }
    return blocks.join('\n\n');
  }

  /** One line per milestone: paid, later, the bank's share, or due with a pay link. */
  private async milestoneLine(
    milestone: typeof paymentMilestones.$inferSelect,
    got: number,
    openUrl: string | null,
    online: boolean,
  ): Promise<string> {
    const left = milestone.amountPaise - got;
    if (left <= 0) return ANSWER_WORDS.paid(milestone.label, formatInr(milestone.amountPaise));
    if (milestone.payer === 'bank') return ANSWER_WORDS.bank(milestone.label, formatInr(left));
    if (milestone.status !== 'due' && milestone.status !== 'partly_paid')
      return ANSWER_WORDS.later(milestone.label, formatInr(left));
    const url =
      openUrl ?? (online ? (await this.links.create({ userId: null }, milestone.id)).url : null);
    return `${ANSWER_WORDS.due(milestone.label, formatInr(left))}${url ? `\n  ${WORDS.payHere}: ${url}` : ''}`;
  }

  /** Quotation, tax invoices, receipts, reports and papers, as links that work for a few days. */
  async documents(customerId: string): Promise<string> {
    const link = (kind: SharedFile['kind'], id: string, key?: string) =>
      sharedFileUrl(this.env, { kind, id, customerId, ...(key ? { key } : {}) });
    const { projects: own } = await this.portal.home(customerId);
    const receipts = await this.db
      .select({ id: payments.id, number: payments.receiptNumber, amount: payments.amountPaise })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .where(and(eq(projects.customerId, customerId), isNotNull(payments.receiptNumber)))
      .orderBy(desc(payments.createdAt))
      .limit(LATEST);
    const papers = (await this.papers.list(customerId))
      .filter((paper) => paper.category !== 'site_photo')
      .slice(0, LATEST);
    const invoices = await issuedInvoices(this.db, customerId, LATEST);
    const reports = (await this.papers.readyReports(customerId)).slice(0, LATEST);
    const projectQuotes = own.map((project) => project.quotation);
    const quotes = [...projectQuotes, ...(await this.sentQuotes(customerId, projectQuotes))];
    const lines = [
      ...quotes.map((quote) => FILE_WORDS.quotation(quote.number, link('quotation', quote.id))),
      ...invoices.map((invoice) =>
        FILE_WORDS.invoice(
          invoice.number,
          formatInr(invoice.totalPaise),
          link('invoice', invoice.id),
        ),
      ),
      ...receipts.map((receipt) =>
        FILE_WORDS.receipt(
          receipt.number ?? '',
          formatInr(receipt.amount),
          link('receipt', receipt.id),
        ),
      ),
      ...reports.map((report) =>
        FILE_WORDS.report(
          report.name,
          report.projectCode,
          link('report', report.projectId, report.key),
        ),
      ),
      ...papers.map((paper) => FILE_WORDS.paper(paper.name, link('document', paper.id))),
    ];
    if (lines.length === 0) return WORDS.noDocuments;
    return fitMessage(lines, WORDS.linksExpire(this.env.FILE_LINK_HOURS), FILE_WORDS.more);
  }

  /** The newest sent or accepted revision of each quotation not already shown with a project. */
  private async sentQuotes(customerId: string, shown: readonly { number: string }[]) {
    const rows = await this.db
      .select({ id: quotations.id, number: quotations.number })
      .from(quotations)
      .where(
        and(
          eq(quotations.customerId, customerId),
          inArray(quotations.status, ['sent', 'accepted']),
        ),
      )
      .orderBy(desc(quotations.revision), desc(quotations.createdAt));
    const seen = new Set(shown.map((quote) => quote.number));
    return rows.filter((row) => !seen.has(row.number) && seen.add(row.number)).slice(0, LATEST);
  }

  async requests(customerId: string): Promise<string> {
    const rows = (await this.portal.serviceRequests(customerId)).slice(0, 5);
    if (rows.length === 0) return WORDS.noRequests;
    const status = ANSWER_WORDS.requestStatus;
    return rows
      .map(
        (row) =>
          `• ${row.description.slice(0, 60)} — *${status[row.status]}*${row.visitOn && row.status !== 'resolved' ? `\n  ${ANSWER_WORDS.technicianVisit(daySpan(row.visitOn, row.visitOn))}` : ''}${row.resolutionNote ? `\n  ${row.resolutionNote}` : ''}`,
      )
      .join('\n');
  }

  /** Each installed item's warranty and the AMC with its next visit (PRD 6.1). */
  async warranty(customerId: string): Promise<string> {
    return coverText(await this.after.cover(customerId));
  }

  /** The people this customer referred and their rewards (PRD 5.6). */
  async rewards(customerId: string): Promise<string> {
    return rewardsText(await this.portal.referrals(customerId));
  }
}
