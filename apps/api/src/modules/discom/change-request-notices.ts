import { Inject, Injectable } from '@nestjs/common';
import type { ChangeRequestNotices } from '@oneohm/api-contracts';
import { projects, properties, quotations } from '@oneohm/database';
import { needsRepricing } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { assertQuotationAccess } from '../quotations/quotation-access';
import { ChangeRequestsService } from './change-requests.service';

interface Scope {
  readonly propertyId?: string | undefined;
  readonly projectId?: string | undefined;
  readonly quotationId?: string | undefined;
}

/**
 * Suggestions shown where people already look (PRD 3.15, step 2): on the site, the
 * project and the quotation, without opening the raise dialog. A quotation also says
 * when it was priced for another property type than the site now has.
 */
@Injectable()
export class ChangeRequestNoticesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly requests: ChangeRequestsService,
  ) {}

  async notices(actor: Actor, scope: Scope): Promise<ChangeRequestNotices> {
    if (scope.quotationId) {
      await assertQuotationAccess(this.db, actor, scope.quotationId);
      return this.forQuotation(scope.quotationId);
    }
    if (scope.projectId) return this.forProject(scope.projectId);
    const propertyId = scope.propertyId ?? '';
    return {
      propertyId,
      projectId: null,
      suggestions: await this.requests.suggestions(propertyId),
      repricing: null,
    };
  }

  private async forProject(projectId: string): Promise<ChangeRequestNotices> {
    const [project] = await this.db
      .select({
        propertyId: projects.propertyId,
        capacityWp: projects.capacityWp,
        status: projects.status,
      })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw notFound('That project');
    const base = { propertyId: project.propertyId, projectId };
    // Only while the project is being built; a finished plant is past these checks.
    if (project.status !== 'active') return { ...base, suggestions: [], repricing: null };
    return {
      ...base,
      suggestions: await this.requests.suggestions(project.propertyId, project.capacityWp),
      repricing: null,
    };
  }

  private async forQuotation(quotationId: string): Promise<ChangeRequestNotices> {
    const [row] = await this.db
      .select({
        propertyId: quotations.propertyId,
        capacityWp: quotations.capacityWp,
        status: quotations.status,
        pricedAs: quotations.subsidyCategory,
        siteIs: properties.subsidyCategory,
      })
      .from(quotations)
      .innerJoin(properties, eq(properties.id, quotations.propertyId))
      .where(eq(quotations.id, quotationId));
    if (!row) throw notFound('That quotation');
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.quotationId, quotationId))
      .limit(1);
    const base = { propertyId: row.propertyId, projectId: project?.id ?? null };
    const open = row.status === 'draft' || row.status === 'sent';
    return {
      ...base,
      suggestions: open ? await this.requests.suggestions(row.propertyId, row.capacityWp) : [],
      repricing: needsRepricing({ status: row.status, subsidyCategory: row.pricedAs }, row.siteIs)
        ? { pricedAs: row.pricedAs, siteIs: row.siteIs }
        : null,
    };
  }
}
