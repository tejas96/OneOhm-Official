import { Inject, Injectable } from '@nestjs/common';
import { paymentMilestones, payments, projectFacts, projects } from '@oneohm/database';
import { formatInr, formatKwp } from '@oneohm/shared';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { daySpan } from '../../../common/notices';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerDocumentsService } from '../../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { openLinksFor } from '../../online-payments/open-links';
import { PaymentLinksService } from '../../online-payments/payment-links.service';
import { type SharedFile, signFileLink } from '../file-links';
import { WORDS } from './words';

const list = (lines: readonly string[]) => lines.filter(Boolean).join('\n');

/** The assistant's answers, each built from the customer's live records. */
@Injectable()
export class AnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly papers: CustomerDocumentsService,
    private readonly links: PaymentLinksService,
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
          `Now: ${WORDS.stage[project.currentStage] ?? project.currentStage} (${done} of ${steps} steps done)`,
          project.nextStep
            ? `Next: ${project.nextStep.title}, planned ${daySpan(project.nextStep.date, project.nextStep.date)}`
            : '',
          project.waiting
            ? `${WORDS.waitingOn[project.waiting.party] ?? ''} since ${daySpan(project.waiting.since, project.waiting.since)}`
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
    if (left <= 0) return `✓ ${milestone.label}: ${formatInr(milestone.amountPaise)} paid`;
    if (milestone.payer === 'bank') return `• ${milestone.label}: ${formatInr(left)} (bank loan)`;
    if (milestone.status !== 'due' && milestone.status !== 'partly_paid')
      return `• ${milestone.label}: ${formatInr(left)} later`;
    const url =
      openUrl ?? (online ? (await this.links.create({ userId: null }, milestone.id)).url : null);
    return `• ${milestone.label}: ${formatInr(left)} due${url ? `\n  ${WORDS.payHere}: ${url}` : ''}`;
  }

  /** The quotation, receipts and shared papers, as links that work for a few days. */
  async documents(customerId: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + this.env.FILE_LINK_HOURS * 3600;
    const link = (kind: SharedFile['kind'], id: string) =>
      `${this.env.API_PUBLIC_URL}/v1/files/shared/${signFileLink(this.env.FILE_LINK_SECRET, { kind, id, customerId, exp })}`;
    const { projects: own } = await this.portal.home(customerId);
    const receipts = await this.db
      .select({ id: payments.id, number: payments.receiptNumber, amount: payments.amountPaise })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .where(and(eq(projects.customerId, customerId), isNotNull(payments.receiptNumber)))
      .orderBy(desc(payments.createdAt))
      .limit(5);
    const papers = (await this.papers.list(customerId))
      .filter((paper) => paper.category !== 'site_photo')
      .slice(0, 5);
    const lines = [
      ...own.map(
        (project) =>
          `Quotation ${project.quotation.number}: ${link('quotation', project.quotation.id)}`,
      ),
      ...receipts.map(
        (receipt) =>
          `Receipt ${receipt.number} (${formatInr(receipt.amount)}): ${link('receipt', receipt.id)}`,
      ),
      ...papers.map((paper) => `${paper.name}: ${link('document', paper.id)}`),
    ];
    if (lines.length === 0) return WORDS.noDocuments;
    return list([...lines, '', WORDS.linksExpire(this.env.FILE_LINK_HOURS)]);
  }

  async requests(customerId: string): Promise<string> {
    const rows = (await this.portal.serviceRequests(customerId)).slice(0, 5);
    if (rows.length === 0) return WORDS.noRequests;
    const status = { open: 'Open', in_progress: 'Being worked on', resolved: 'Resolved' } as const;
    return rows
      .map(
        (row) =>
          `• ${row.description.slice(0, 60)} — *${status[row.status]}*${row.resolutionNote ? `\n  ${row.resolutionNote}` : ''}`,
      )
      .join('\n');
  }

  async warranty(customerId: string): Promise<string> {
    const own = await this.db
      .select({ id: projects.id, code: projects.code })
      .from(projects)
      .where(eq(projects.customerId, customerId));
    if (own.length === 0) return WORDS.noProject;
    const facts = await this.db
      .select()
      .from(projectFacts)
      .where(
        inArray(
          projectFacts.projectId,
          own.map((project) => project.id),
        ),
      );
    return own
      .map((project) => {
        const fact = (key: string) =>
          facts.find((row) => row.projectId === project.id && row.key === key)?.value;
        return list([
          `*${project.code}*`,
          fact('module_make')
            ? `Panels: ${fact('module_count') ?? ''} × ${fact('module_make')}`
            : '',
          fact('inverter_make') ? `Inverter: ${fact('inverter_make')}` : '',
          'Warranty cards from the makers are in your documents. For AMC or a service visit, tap "Report a problem".',
        ]);
      })
      .join('\n\n');
  }
}
