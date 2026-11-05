import { Inject, Injectable } from '@nestjs/common';
import { localValues, quotations } from '@oneohm/database';
import { inArray } from 'drizzle-orm';
import { daySpan } from '../../../common/notices';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerAfterSalesService } from '../../after-sales/customer-after-sales.service';
import { activeHomes } from '../../customer-portal/active-projects';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { subsidyNote } from '../../journey/subsidy-note';
import { coverText } from './cover-answer';
import { shownProblem } from './home-lines';
import { languageNow } from './language';
import { payNowReplies } from './pay-buttons';
import { paymentsText } from './payments-answer';
import { stepTicks } from './progress-line';
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
    private readonly after: CustomerAfterSalesService,
  ) {}

  /**
   * Project update (redesign §3): one message per home with its steps ticked, the next
   * step, and what it waits for. `waitingOnYou` adds [Send it now]. None: no project.
   */
  async progress(customerId: string): Promise<{ body: string; waitingOnYou: boolean }[]> {
    const { projects: own } = await this.portal.home(customerId);
    // The size in panels (C9): the panel count is on each project's quotation.
    const counts = own.length
      ? await this.db
          .select({ id: quotations.id, panels: quotations.moduleCount })
          .from(quotations)
          .where(
            inArray(
              quotations.id,
              own.map((project) => project.quotation.id),
            ),
          )
      : [];
    const subsidies = await Promise.all(
      own.map((project) =>
        project.subsidy.status === 'released' ? subsidyNote(this.db, project.id) : null,
      ),
    );
    return own.map((project, index) => {
      const panels = counts.find((row) => row.id === project.quotation.id)?.panels ?? 0;
      const body = list([
        ANSWER_WORDS.home(project.place, PROJECT_WORDS.size(panels, project.capacityWp)),
        stepTicks(project),
        project.nextStep
          ? ANSWER_WORDS.next(
              stepTitle(project.nextStep.key, project.nextStep.title),
              daySpan(project.nextStep.date, project.nextStep.date),
            )
          : '',
        project.waiting
          ? ANSWER_WORDS.waitingSince(
              WORDS.waitingOn[project.waiting.party] ?? '',
              daySpan(project.waiting.since, project.waiting.since),
            )
          : '',
        WORDS.subsidy[subsidies[index] ?? project.subsidy.status] ?? '',
      ]);
      return { body, waitingOnYou: project.waiting?.party === 'customer' };
    });
  }

  /** What is paid and due, one block per home (see paymentsText). */
  payments(customerId: string) {
    return paymentsText(this.db, customerId);
  }

  /** The pay-link message for each due amount (or only `milestoneId`'s). */
  payNow(customerId: string, milestoneId?: string) {
    return payNowReplies(this.db, this.env, customerId, milestoneId);
  }

  async requests(customerId: string): Promise<string> {
    const rows = (await this.portal.serviceRequests(customerId)).slice(0, 5);
    if (rows.length === 0) return WORDS.noRequests;
    const status = ANSWER_WORDS.requestStatus;
    return rows
      .map(
        (row) =>
          `• ${shownProblem(row.description).slice(0, 60)} — *${status[row.status]}*${row.visitOn && row.status !== 'resolved' ? `\n  ${ANSWER_WORDS.technicianVisit(daySpan(row.visitOn, row.visitOn))}` : ''}${row.resolutionNote ? `\n  ${row.resolutionNote}` : ''}`,
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

/** A OneOhm step's name in the chat's language; a step the team named itself stays as typed. */
function stepTitle(key: string | null, title: string): string {
  if (!key) return title;
  return (
    localValues(languageNow(), 'project_milestone', { step: key, milestone: title }).milestone ??
    title
  );
}
