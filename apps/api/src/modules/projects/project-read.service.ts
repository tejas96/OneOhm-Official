import { Inject, Injectable } from '@nestjs/common';
import type { ProjectDetail } from '@oneohm/api-contracts';
import {
  customers,
  paymentMilestones,
  payments,
  projectActivities,
  projectFacts,
  projects,
  projectTasks,
  properties,
  quotations,
  users,
} from '@oneohm/database';
import { asc, desc, eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { projectSummaries } from '../../common/read-models/project-summary';
import { presentTasks } from '../../common/read-models/project-tasks';
import { DATABASE, type Database } from '../../config/core.module';
import { openLinksFor } from '../online-payments/open-links';
import { ReportStatusService } from '../reports/report-status.service';
import { ProjectTeamService } from './project-team.service';

/** The project control room: everything about one project in one answer. */
@Injectable()
export class ProjectReadService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly reports: ReportStatusService,
    private readonly team: ProjectTeamService,
  ) {}

  list() {
    return projectSummaries(this.db);
  }

  async get(id: string): Promise<ProjectDetail> {
    const [summary] = await projectSummaries(this.db, eq(projects.id, id));
    const [row] = await this.db
      .select({
        project: projects,
        customer: customers,
        property: properties,
        quotation: quotations,
        managerName: users.fullName,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .innerJoin(quotations, eq(quotations.id, projects.quotationId))
      .leftJoin(users, eq(users.id, projects.managerUserId))
      .where(eq(projects.id, id))
      .limit(1);
    if (!summary || !row) throw notFound('That project');
    const { project, customer, property, quotation, managerName } = row;
    const milestones = await this.db
      .select()
      .from(paymentMilestones)
      .where(eq(paymentMilestones.projectId, id))
      .orderBy(asc(paymentMilestones.position));
    const links = await openLinksFor(
      this.db,
      milestones.map((milestone) => milestone.id),
    );
    const paymentRows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.projectId, id))
      .orderBy(desc(payments.receivedOn));
    const facts = await this.db.select().from(projectFacts).where(eq(projectFacts.projectId, id));
    const activities = await this.db
      .select({ activity: projectActivities, userName: users.fullName })
      .from(projectActivities)
      .leftJoin(users, eq(users.id, projectActivities.userId))
      .where(eq(projectActivities.projectId, id))
      .orderBy(desc(projectActivities.createdAt))
      .limit(50);
    return {
      ...summary,
      customer: { id: customer.id, name: customer.name, phone: customer.phoneE164 },
      address: `${property.addressLine}, ${property.city}, ${property.district}`,
      manager:
        project.managerUserId && managerName
          ? { id: project.managerUserId, fullName: managerName }
          : null,
      version: project.version,
      startDate: project.startDate,
      loan: project.loan,
      lenderName: project.lenderName,
      battery: project.battery,
      groundMount: project.groundMount,
      subsidy: project.subsidy,
      financiallyClosedAt: project.financiallyClosedAt?.toISOString() ?? null,
      budget: {
        status: project.budgetStatus as ProjectDetail['budget']['status'],
        variancePaise: project.surveyVariancePaise,
        varianceBp: project.surveyVarianceBp,
        lockedAt: project.budgetLockedAt?.toISOString() ?? null,
        revisionQuotationId: project.revisionQuotationId,
      },
      quotation: {
        id: quotation.id,
        number: quotation.number,
        totalPaise: quotation.totalPaise,
        subsidyPaise: quotation.subsidyPaise,
        effectivePaise: quotation.effectivePaise,
      },
      tasks: await presentTasks(this.db, eq(projectTasks.projectId, id)),
      milestones: milestones.map((milestone) => {
        const paid = paymentRows
          .filter((payment) => payment.milestoneId === milestone.id)
          .reduce((sum, payment) => sum + payment.amountPaise, 0);
        return {
          id: milestone.id,
          label: milestone.label,
          payer: milestone.payer,
          amountPaise: milestone.amountPaise,
          paidPaise: paid,
          status: milestone.status,
          trigger: milestone.trigger,
          link: links.get(milestone.id) ?? null,
        };
      }),
      payments: paymentRows.map((payment) => ({
        id: payment.id,
        milestoneId: payment.milestoneId,
        payer: payment.payer,
        method: payment.method,
        amountPaise: payment.amountPaise,
        receivedOn: payment.receivedOn,
        reference: payment.reference,
      })),
      facts: Object.fromEntries(facts.map((fact) => [fact.key, fact.value])),
      activities: activities.map(({ activity, userName }) => ({
        id: activity.id,
        kind: activity.kind,
        message: activity.message,
        user: activity.userId && userName ? { id: activity.userId, fullName: userName } : null,
        createdAt: activity.createdAt.toISOString(),
      })),
      reports: await this.reports.statuses(id),
      setup: await this.team.setup(project),
    };
  }
}
