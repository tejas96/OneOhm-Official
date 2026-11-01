import { Inject, Injectable } from '@nestjs/common';
import type { ChangeRequestDetail, ChangeRequestSummary } from '@oneohm/api-contracts';
import {
  changeRequests,
  changeRequestTypes,
  ensureChangeRequestTypes,
  properties,
  quotations,
} from '@oneohm/database';
import {
  type ChangeRequestSuggestion,
  missingChangeRequestDocuments,
  suggestChangeRequests,
  validateChangeRequestValues,
} from '@oneohm/domain';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { typeAt } from '../../common/read-models/change-request-type-store';
import { DATABASE, type Database } from '../../config/core.module';
import { loadAssigneeCandidates } from '../projects/task-library.loader';
import { raiseChangeRequest } from './change-request-raise';
import { changeRequestSummaries, presentChangeRequest } from './change-request-read';
import {
  papersOnFile,
  type RequestScope,
  type RequestSite,
  requestSite,
} from './change-request-site';
import { siteUtility } from './site-utility';

@Injectable()
export class ChangeRequestsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(query: {
    status?: ChangeRequestSummary['status'] | undefined;
    customerId?: string | undefined;
    propertyId?: string | undefined;
    projectId?: string | undefined;
  }): Promise<ChangeRequestSummary[]> {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(changeRequests.status, query.status));
    if (query.customerId) filters.push(eq(changeRequests.customerId, query.customerId));
    if (query.propertyId) filters.push(eq(changeRequests.propertyId, query.propertyId));
    if (query.projectId) filters.push(eq(changeRequests.projectId, query.projectId));
    return changeRequestSummaries(this.db, filters.length ? and(...filters) : undefined);
  }

  get(id: string): Promise<ChangeRequestDetail> {
    return presentChangeRequest(this.db, id);
  }

  /**
   * Mismatches on a property worth a change request (PRD 3.15, step 2), limited to the
   * changes the site's DISCOM offers. The system's size is the one given (a project or
   * quotation), else the site's latest quotation.
   */
  async suggestions(
    propertyId: string,
    capacityWp?: number,
  ): Promise<(ChangeRequestSuggestion & { title: string })[]> {
    const site = await requestSite(this.db, { propertyId });
    const [latest] =
      capacityWp === undefined
        ? await this.db
            .select({ capacityWp: quotations.capacityWp })
            .from(quotations)
            .where(eq(quotations.propertyId, propertyId))
            .orderBy(desc(quotations.createdAt))
            .limit(1)
        : [{ capacityWp }];
    const offered = await this.offered(site);
    const open = await this.list({ propertyId, status: 'open' });
    return suggestChangeRequests({
      customerName: site.customer.name,
      ...(await siteUtility(this.db, site.property)),
      proposedCapacityWp: latest?.capacityWp ?? null,
    }).flatMap((suggestion) => {
      const title = offered.get(suggestion.type);
      if (!title || open.some((request) => request.type === suggestion.type)) return [];
      return [{ ...suggestion, title }];
    });
  }

  /** Active change types at the site's DISCOM, key → title (all six when it has none). */
  private async offered(site: RequestSite): Promise<Map<string, string>> {
    if (!site.discom) return new Map();
    await ensureChangeRequestTypes(this.db, site.discom.id);
    const rows = await this.db
      .select({ key: changeRequestTypes.key, title: changeRequestTypes.title })
      .from(changeRequestTypes)
      .where(
        and(eq(changeRequestTypes.discomId, site.discom.id), eq(changeRequestTypes.active, true)),
      );
    return new Map(rows.map((row) => [row.key, row.title]));
  }

  /**
   * One step: pick the type, fill its fields; the DISCOM steps are generated and assigned
   * (PRD 3.15). The type is the site's DISCOM's own, and its required papers must be on
   * file for the customer or the site first.
   */
  async create(
    actor: Actor,
    request: RequestScope & {
      type: string;
      values: Record<string, string>;
      note?: string | null | undefined;
    },
  ): Promise<ChangeRequestDetail> {
    const site = await requestSite(this.db, request);
    if (!site.discom)
      throw invalid('Pick the DISCOM this site is with.', { discomId: 'Pick the DISCOM.' });
    const definition = await typeAt(this.db, site.discom.id, request.type);
    if (!definition.active)
      throw invalid(
        `${site.discom.code} does not take ${definition.title.toLowerCase()} requests.`,
        {
          type: 'Switched off in Settings → DISCOMs.',
        },
      );
    const { values, errors } = validateChangeRequestValues(definition.fields, request.values);
    if (Object.keys(errors).length > 0)
      throw invalid('Fill in the details this request needs.', errors);
    const onFile = await papersOnFile(this.db, site, definition.documents);
    const missing = missingChangeRequestDocuments(definition.documents, onFile);
    if (missing.length > 0)
      throw invalid('Add the papers this request needs to the customer first.', {
        documents: missing.join(','),
      });
    const duplicate = await this.list({ propertyId: site.property.id, status: 'open' });
    if (duplicate.some((open) => open.type === definition.key))
      throw conflict(
        `An open ${definition.title.toLowerCase()} request already exists for this site.`,
        'duplicate',
      );
    const candidates = await loadAssigneeCandidates(this.db);
    const discomId = site.discom.id;
    const { id } = await this.db.transaction(async (tx) => {
      // The DISCOM picked for a site that had none is kept on the site.
      if (site.siteHasNoDiscom && !site.project) {
        await tx
          .update(properties)
          .set({ discomId, updatedAt: new Date() })
          .where(eq(properties.id, site.property.id));
      }
      return raiseChangeRequest(
        tx,
        actor.userId,
        {
          definition,
          customer: site.customer,
          propertyId: site.property.id,
          projectId: request.projectId ?? null,
          values,
          note: request.note ?? null,
        },
        candidates,
      );
    });
    return this.get(id);
  }

  async cancel(actor: Actor, id: string, reason: string): Promise<ChangeRequestDetail> {
    const [request] = await this.db.select().from(changeRequests).where(eq(changeRequests.id, id));
    if (!request) throw notFound('That change request');
    if (request.status !== 'open')
      throw conflict('This change request is already closed.', 'closed');
    await this.db
      .update(changeRequests)
      .set({ status: 'cancelled', cancelledReason: reason, updatedAt: new Date() })
      .where(eq(changeRequests.id, id));
    await recordAudit(this.db, actor.userId, 'change_request.cancelled', 'change_request', id, {
      reason,
    });
    return this.get(id);
  }
}
