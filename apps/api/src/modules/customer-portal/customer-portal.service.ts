import { Inject, Injectable } from '@nestjs/common';
import type { CustomerHome, Referral, ServiceRequest } from '@oneohm/api-contracts';
import {
  customerFeedback,
  customers,
  leads,
  projects,
  quotations,
  serviceRequests,
} from '@oneohm/database';
import type { LeadStage } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { customerProjects } from './customer-home';

const REFERRAL_STATUS: Readonly<Record<LeadStage, Referral['status']>> = {
  new: 'received',
  contacted: 'in_progress',
  survey_scheduled: 'in_progress',
  quoted: 'in_progress',
  won: 'installed',
  lost: 'closed',
};

type Category = ServiceRequest['category'];
type Status = ServiceRequest['status'];

/** What a signed-in customer can see and do; every query is scoped to that customer. */
@Injectable()
export class CustomerPortalService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async home(customerId: string): Promise<CustomerHome> {
    const [customer] = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phoneE164,
        email: customers.email,
      })
      .from(customers)
      .where(eq(customers.id, customerId));
    if (!customer) throw notFound('Your account');
    return { customer, projects: await customerProjects(this.db, customerId) };
  }

  /** The quotation id, only when it belongs to this customer. */
  async ownQuotation(customerId: string, quotationId: string): Promise<string> {
    const [row] = await this.db
      .select({ id: quotations.id })
      .from(quotations)
      .where(and(eq(quotations.id, quotationId), eq(quotations.customerId, customerId)));
    if (!row) throw notFound('That quotation');
    return row.id;
  }

  async referrals(customerId: string): Promise<Referral[]> {
    const rows = await this.db
      .select({ id: leads.id, name: leads.name, stage: leads.stage, createdAt: leads.createdAt })
      .from(leads)
      .where(eq(leads.referredByCustomerId, customerId))
      .orderBy(desc(leads.createdAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: REFERRAL_STATUS[row.stage],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async refer(
    customerId: string,
    input: { name: string; phone: string; city?: string | undefined; note?: string | undefined },
  ): Promise<Referral> {
    const [open] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.phoneE164, input.phone), notInArray(leads.stage, ['won', 'lost'])))
      .limit(1);
    if (open) throw conflict('We are already in touch with this number. Thank you!', 'duplicate');
    const [referrer] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId));
    const [lead] = await this.db
      .insert(leads)
      .values({
        name: input.name,
        phoneE164: input.phone,
        city: input.city?.trim() || 'Not given',
        source: 'referral',
        referredByCustomerId: customerId,
        nextActionOn: todayIn(),
        nextActionNote: `Call: referred by ${referrer?.name ?? 'a customer'}`,
        notes: input.note ?? null,
      })
      .returning({ id: leads.id, name: leads.name, createdAt: leads.createdAt });
    if (!lead) throw new Error('Referral was not saved.');
    return {
      id: lead.id,
      name: lead.name,
      status: 'received',
      createdAt: lead.createdAt.toISOString(),
    };
  }

  async serviceRequests(customerId: string): Promise<ServiceRequest[]> {
    const rows = await this.db
      .select({ request: serviceRequests, projectCode: projects.code })
      .from(serviceRequests)
      .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
      .where(eq(serviceRequests.customerId, customerId))
      .orderBy(desc(serviceRequests.createdAt));
    return rows.map(({ request, projectCode }) => ({
      id: request.id,
      projectCode,
      category: request.category as Category,
      description: request.description,
      status: request.status as Status,
      resolutionNote: request.resolutionNote,
      createdAt: request.createdAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
    }));
  }

  async raiseServiceRequest(
    customerId: string,
    input: { projectId?: string | null | undefined; category: Category; description: string },
  ): Promise<ServiceRequest> {
    if (input.projectId) await this.ownProject(customerId, input.projectId);
    const [row] = await this.db
      .insert(serviceRequests)
      .values({
        customerId,
        projectId: input.projectId ?? null,
        category: input.category,
        description: input.description,
      })
      .returning({ id: serviceRequests.id });
    const created = (await this.serviceRequests(customerId)).find((item) => item.id === row?.id);
    if (!created) throw new Error('Service request was not saved.');
    return created;
  }

  async feedback(
    customerId: string,
    input: { projectId: string; rating: number; comment?: string | undefined },
  ): Promise<void> {
    await this.ownProject(customerId, input.projectId);
    await this.db.delete(customerFeedback).where(eq(customerFeedback.projectId, input.projectId));
    await this.db.insert(customerFeedback).values({
      customerId,
      projectId: input.projectId,
      rating: input.rating,
      comment: input.comment ?? null,
    });
  }

  private async ownProject(customerId: string, projectId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.customerId, customerId)));
    if (!row) throw notFound('That project');
  }
}
