import { Inject, Injectable } from '@nestjs/common';
import { quotations } from '@oneohm/database';
import { inArray } from 'drizzle-orm';
import { daySpan } from '../../../common/notices';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerAfterSalesService } from '../../after-sales/customer-after-sales.service';
import { activeHomes } from '../../customer-portal/active-projects';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { PaymentLinksService } from '../../online-payments/payment-links.service';
import { coverText } from './cover-answer';
import { payNowReplies } from './pay-buttons';
import { paymentsText } from './payments-answer';
import { stageLine } from './progress-line';
import { PROJECT_WORDS } from './project-words';
import { rewardsText } from './rewards-answer';
import { ANSWER_WORDS, WORDS } from './words';

const list = (lines: readonly string[]) => lines.filter(Boolean).join('\n');

/** The assistant's answers, each built from the customer's live records. */
@Injectable()
export class AnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly links: PaymentLinksService,
    private readonly after: CustomerAfterSalesService,
  ) {}

  async progress(customerId: string): Promise<string> {
    const { projects: own } = await this.portal.home(customerId);
    if (own.length === 0) return WORDS.noProject;
    // The size in panels (C9): the panel count is on each project's quotation.
    const counts = await this.db
      .select({ id: quotations.id, panels: quotations.moduleCount })
      .from(quotations)
      .where(
        inArray(
          quotations.id,
          own.map((project) => project.quotation.id),
        ),
      );
    return own
      .map((project) => {
        const panels = counts.find((row) => row.id === project.quotation.id)?.panels ?? 0;
        return list([
          `*${PROJECT_WORDS.projectIn(project.place)}* · ${PROJECT_WORDS.size(panels, project.capacityWp)}`,
          stageLine(project),
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

  /** What is paid and due (see paymentsText); our pay page links only with no buttons. */
  async payments(customerId: string, withLinks: boolean): Promise<string> {
    const online = withLinks && this.links.setup().mode !== 'off';
    return paymentsText(this.db, this.env, customerId, online);
  }

  /** True when the customer has an active project, so "Pay now" or "Track" leads somewhere. */
  async hasProject(customerId: string): Promise<boolean> {
    return (await activeHomes(this.db, customerId)).length > 0;
  }

  /** A "Pay now" message for each due amount; the text answer is sent first. */
  payNow(customerId: string) {
    return payNowReplies(this.db, this.env, customerId);
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
    const towns = await activeHomes(this.db, customerId);
    const places = new Map(towns.map((town) => [town.id, town.city]));
    // A cancelled home has no cover to tell (menu audit M7).
    const after = await this.after.cover(customerId);
    const covers = after.projects.filter((cover) => places.has(cover.projectId));
    return coverText({ ...after, projects: covers }, places);
  }

  /** The people this customer referred and their rewards (PRD 5.6). */
  async rewards(customerId: string): Promise<string> {
    return rewardsText(await this.portal.referrals(customerId));
  }
}
