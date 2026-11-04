import { Inject, Injectable, Logger } from '@nestjs/common';
import { customerActions, customers, documents, projects } from '@oneohm/database';
import { eq, inArray, max } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { DATABASE, type Database } from '../../config/core.module';
import { logAction } from '../documents/customer-action-log';
import { languageOfPhone, tellStalePaper } from '../documents/document-request-messages';
import { paperKindWords } from '../documents/paper-kind-words';
import { DocumentChecklistService } from './document-checklist.service';

/** The month a paper is from, in the customer's language ("October 2026"). */
function monthOf(at: Date, language: string): string {
  return new Intl.DateTimeFormat(`${language}-IN`, { month: 'long', year: 'numeric' }).format(at);
}

/**
 * When the DISCOM application starts (redesign 5.4), any paper on the project's home that is
 * older than its checklist item allows (the electricity bill, 90 days) is asked for again,
 * and the customer is told why. An item the customer is already asked for is left alone.
 */
@Injectable()
export class StalePaperAsksService {
  private readonly log = new Logger('StalePaperAsks');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly checklists: DocumentChecklistService,
  ) {}

  /**
   * A task has just started: if it is the DISCOM application (MSEDCL's, or another's
   * `<code>_application`; not the subsidy's), stale papers are asked for. Never undoes the start.
   */
  async afterStart(task: { projectId: string; templateKey: string }): Promise<void> {
    const key = task.templateKey;
    const application =
      key === 'discom_application' ||
      (key.endsWith('_application') && key !== 'subsidy_application');
    if (!application) return;
    try {
      await this.askForStale(task.projectId);
    } catch (error) {
      this.log.error(`Stale papers not asked for ${task.projectId}: ${String(error)}`);
    }
  }

  /** Returns how many papers were asked for. */
  async askForStale(projectId: string): Promise<number> {
    const { items } = await this.checklists.checklist(projectId);
    const stale = items.filter((item) => item.tooOld && item.askCategory && !item.requested);
    if (stale.length === 0) return 0;
    const [project] = await this.db
      .select({
        code: projects.code,
        propertyId: projects.propertyId,
        customerId: customers.id,
        customer: customers.name,
        phone: customers.phoneE164,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(eq(projects.id, projectId));
    if (!project) return 0;
    const language = await languageOfPhone(this.db, project.phone);
    for (const item of stale) {
      const category = item.askCategory;
      if (!category) continue;
      const [newest] = await this.db
        .select({ at: max(documents.createdAt) })
        .from(documents)
        .where(inArray(documents.id, item.documentIds));
      await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(customerActions)
          .values({
            type: 'paper',
            customerId: project.customerId,
            projectId,
            propertyId: project.propertyId,
            category,
            title: item.label,
            requirementKey: item.key,
            note: '',
            requestedByUserId: null,
          })
          .returning({ id: customerActions.id });
        if (!row) throw new Error('Customer action insert returned nothing');
        const asked = {
          id: row.id,
          projectId,
          projectCode: project.code,
          propertyId: project.propertyId,
          title: item.label,
          customer: project.customer,
          phone: project.phone,
        };
        await tellStalePaper(tx, asked, {
          document: paperKindWords(language, category),
          month: monthOf(newest?.at ?? new Date(), language),
        });
        await logAction(
          tx,
          { projectId, leadId: null },
          {
            kind: 'document_request',
            message: `Asked the customer for ${item.label} again: the one we have is too old`,
            userId: null,
            data: { customerActionId: row.id, stale: true },
          },
        );
        await recordAudit(tx, null, 'customer_action.created', 'customer_action', row.id, {
          type: 'paper',
          project: project.code,
          category,
          stale: true,
        });
      });
    }
    return stale.length;
  }
}
