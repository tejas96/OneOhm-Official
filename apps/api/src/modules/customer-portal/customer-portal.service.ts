import { Inject, Injectable } from '@nestjs/common';
import type { CustomerHome, Referral, ServiceRequest } from '@oneohm/api-contracts';
import {
  customerFeedback,
  customers,
  leads,
  notify,
  notifyHolders,
  openServiceRequest,
  projects,
  quotations,
  serviceRequests,
} from '@oneohm/database';
import { customerLanguage } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, notInArray } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { pickableCategory } from '../../common/read-models/service-categories';
import {
  serviceRequestRows,
  toCustomerRequest,
} from '../../common/read-models/service-request-rows';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { customerReferrals } from '../referrals/customer-referrals.read';
import { resolveReferralCode } from '../referrals/referral-codes';
import { suggestRatingPoints } from '../workforce/points';
import { viewerOf } from './customer-family';
import { customerProjects } from './customer-home';

/** What a signed-in customer can see and do; every query is scoped to that customer. */
@Injectable()
export class CustomerPortalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
  ) {}

  async home(customerId: string, contactId: string | null = null): Promise<CustomerHome> {
    const [customer] = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phoneE164,
        email: customers.email,
        language: customers.preferredLanguage,
      })
      .from(customers)
      .where(eq(customers.id, customerId));
    if (!customer) throw notFound('Your account');
    const company = await this.catalog.company();
    return {
      customer: {
        ...customer,
        language: customerLanguage(customer.language),
        viewer: await viewerOf(this.db, contactId),
      },
      projects: await customerProjects(this.db, customerId),
      company: { name: company.brandName, phones: company.phones, email: company.email },
    };
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

  /** People the customer referred, how each is going and the reward it earned (PRD 5.6). */
  referrals(customerId: string): Promise<Referral[]> {
    return customerReferrals(this.db, customerId);
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
    await notifyHolders(this.db, 'leads.manage', {
      kind: 'referral',
      title: 'New referral',
      body: `${lead.name}, referred by ${referrer?.name ?? 'a customer'}. Call them today.`,
      dedupeKey: `referral:${lead.id}`,
    });
    return {
      id: lead.id,
      name: lead.name,
      status: 'received',
      reward: null,
      createdAt: lead.createdAt.toISOString(),
    };
  }

  /**
   * Someone new messaged OneOhm with a customer's referral code (the shared WhatsApp
   * text): they become a referral lead of that customer. Null for an unknown code.
   */
  async referByCode(
    code: string,
    friend: { name: string; phone: string },
  ): Promise<{ referrer: string } | null> {
    const owner = await resolveReferralCode(this.db, code);
    if (!owner || owner.phone === friend.phone) return null;
    await this.refer(owner.customerId, {
      ...friend,
      note: `Messaged on WhatsApp with code ${owner.code}.`,
    });
    return { referrer: owner.name.split(/\s+/)[0] ?? owner.name };
  }

  async serviceRequests(customerId: string): Promise<ServiceRequest[]> {
    const rows = await serviceRequestRows(this.db, eq(serviceRequests.customerId, customerId));
    return rows.map(toCustomerRequest);
  }

  /** Opens the request with its service levels and owner (see openServiceRequest). */
  async raiseServiceRequest(
    customerId: string,
    input: { projectId?: string | null | undefined; category: string; description: string },
  ): Promise<ServiceRequest> {
    if (input.projectId) await this.ownProject(customerId, input.projectId);
    const created = await openServiceRequest(this.db, {
      customerId,
      projectId: input.projectId ?? null,
      category: await pickableCategory(this.db, input.category),
      description: input.description,
    });
    const notice = {
      kind: 'service_request',
      title: 'New service request',
      body: input.description.slice(0, 140),
      subject: {
        type: 'service_request' as const,
        id: created.id,
        projectId: input.projectId ?? null,
      },
      dedupeKey: `service_request:${created.id}`,
    };
    await notifyHolders(this.db, 'service.manage', notice);
    if (created.assigneeUserId)
      await notify(
        this.db,
        { userId: created.assigneeUserId },
        {
          ...notice,
          dedupeKey: `${notice.dedupeKey}:${created.assigneeUserId}`,
        },
      );
    const [row] = await serviceRequestRows(this.db, eq(serviceRequests.id, created.id));
    if (!row) throw new Error('Service request was not saved.');
    return toCustomerRequest(row);
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
    await suggestRatingPoints(this.db, { projectId: input.projectId, rating: input.rating });
  }

  private async ownProject(customerId: string, projectId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.customerId, customerId)));
    if (!row) throw notFound('That project');
  }
}
