import { Inject, Injectable } from '@nestjs/common';
import type {
  AmcContract,
  CustomerAfterSales,
  CustomerCover,
  CustomerServiceCategory,
  CustomerVisit,
  ServiceRequest,
} from '@oneohm/api-contracts';
import {
  customers,
  notifyHolders,
  projects,
  serviceRatings,
  serviceRequests,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq } from 'drizzle-orm';
import { invalid, notFound } from '../../common/http/errors';
import { customerCategories } from '../../common/read-models/service-categories';
import {
  serviceRequestRows,
  toCustomerRequest,
} from '../../common/read-models/service-request-rows';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { lowRatingFollowUp } from '../care/low-rating';
import { closeRatingAsk } from '../care/rating-ask';
import { assetsOf, contractsOf } from './after-sales.read';
import { commissionedOn } from './installed-assets.record';

const STATE_ORDER = { active: 0, upcoming: 1, ended: 2, cancelled: 3 } as const;

/** The contract to show: the running one, else the next, else the last that ran. */
function currentAmc(contracts: readonly AmcContract[]): AmcContract | undefined {
  return [...contracts]
    .filter((contract) => contract.state !== 'cancelled')
    .sort((left, right) => STATE_ORDER[left.state] - STATE_ORDER[right.state])[0];
}

function coverOf(contract: AmcContract | undefined): CustomerCover['amc'] {
  if (!contract) return null;
  return {
    planName: contract.planName,
    startsOn: contract.startsOn,
    endsOn: contract.endsOn,
    includes: contract.includes,
    visitsTotal: contract.visits.length,
    visitsDone: contract.visits.filter((visit) => visit.request?.status === 'resolved').length,
    state: contract.state,
  };
}

function upcoming(code: string, contracts: readonly AmcContract[], today: string): CustomerVisit[] {
  return contracts
    .filter((contract) => contract.state === 'active' || contract.state === 'upcoming')
    .flatMap((contract) =>
      contract.visits
        .filter((visit) => visit.dueOn >= today && visit.request?.status !== 'resolved')
        .map((visit) => ({
          id: visit.id,
          projectCode: code,
          dueOn: visit.dueOn,
          visitName: contract.visitName,
          planName: contract.planName,
          status: visit.request?.status ?? null,
        })),
    );
}

/** What a signed-in customer sees of warranties, AMCs, visits and their ratings (PRD 5.5). */
@Injectable()
export class CustomerAfterSalesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  async cover(customerId: string): Promise<CustomerAfterSales> {
    const own = await this.db
      .select({ id: projects.id, code: projects.code })
      .from(projects)
      .where(eq(projects.customerId, customerId))
      .orderBy(asc(projects.createdAt));
    const today = todayIn();
    const ids = own.map((project) => project.id);
    const [assets, contracts] = await Promise.all([
      assetsOf(this.db, ids, today),
      contractsOf(this.db, ids, today),
    ]);
    const covers: CustomerCover[] = [];
    for (const project of own) {
      covers.push({
        projectId: project.id,
        projectCode: project.code,
        commissionedOn: await commissionedOn(this.db, project.id),
        assets: (assets.get(project.id) ?? []).map(
          ({ id: _id, serialNumbers: _serials, ...asset }) => asset,
        ),
        amc: coverOf(currentAmc(contracts.get(project.id) ?? [])),
      });
    }
    const visits = own
      .flatMap((project) => upcoming(project.code, contracts.get(project.id) ?? [], today))
      .sort((left, right) => left.dueOn.localeCompare(right.dueOn))
      .slice(0, 6);
    return { projects: covers, upcomingVisits: visits };
  }

  categories(): Promise<CustomerServiceCategory[]> {
    return customerCategories(this.db);
  }

  async rate(
    customerId: string,
    requestId: string,
    input: { rating: number; comment?: string | undefined },
  ): Promise<ServiceRequest> {
    const [request] = await this.db
      .select({ status: serviceRequests.status, projectId: serviceRequests.projectId })
      .from(serviceRequests)
      .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.customerId, customerId)));
    if (!request) throw notFound('That request');
    if (request.status !== 'resolved') throw invalid('You can rate a request once it is resolved.');
    const comment = input.comment?.trim() || null;
    await this.db
      .insert(serviceRatings)
      .values({ serviceRequestId: requestId, customerId, rating: input.rating, comment })
      .onConflictDoUpdate({
        target: serviceRatings.serviceRequestId,
        set: { rating: input.rating, comment, createdAt: new Date() },
      });
    await closeRatingAsk(this.db, { kind: 'problem', requestId });
    if (input.rating <= 2) {
      await notifyHolders(this.db, 'service.manage', {
        kind: 'service_low_rating',
        title: `A customer rated a service request ${input.rating} of 5`,
        body: comment ?? 'No comment. Call them to find out what went wrong.',
        subject: { type: 'service_request', id: requestId, projectId: request.projectId },
        dedupeKey: `service_rating:${requestId}:${input.rating}`,
      });
      // The same follow-up as on WhatsApp: a promised call as a task.
      const [who] = await this.db
        .select({ name: customers.name, phone: customers.phoneE164 })
        .from(customers)
        .where(eq(customers.id, customerId));
      const [asked] = await this.db
        .select({ assignee: serviceRequests.assigneeUserId })
        .from(serviceRequests)
        .where(eq(serviceRequests.id, requestId));
      await lowRatingFollowUp(this.db, {
        customerId,
        customerName: who?.name ?? 'The customer',
        phone: who?.phone ?? '',
        projectId: request.projectId,
        assignee: asked?.assignee ?? null,
        label: 'the service request',
        stars: input.rating,
        key: `rating_low:problem:${requestId}`,
        timeZone: this.env.BUSINESS_TIMEZONE,
        desk: true,
      });
    }
    const [row] = await serviceRequestRows(this.db, eq(serviceRequests.id, requestId));
    if (!row) throw notFound('That request');
    return toCustomerRequest(row);
  }
}
