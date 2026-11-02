import { Inject, Injectable } from '@nestjs/common';
import type { Customer, Property, PropertyInput } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  projects,
  properties,
  quotations,
} from '@oneohm/database';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import type { Patch } from '../../common/patch';
import { projectSummaries } from '../../common/read-models/project-summary';
import { quotationSummaries } from '../../common/read-models/quotation-summary';
import { DATABASE, type Database } from '../../config/core.module';
import { otherAccounts } from './customer-accounts.read';
import { type CustomerPatch, editCustomer } from './customer-edit';
import { logLead } from './lead-history';
import { LeadsService } from './leads.service';
import { addSite, editSite, insertLeadSite } from './site-edit';
import { savingSite } from './site-rules';

const presentProperty = (row: typeof properties.$inferSelect): Property => {
  const {
    createdAt: _c,
    updatedAt: _u,
    version: _v,
    locationAccuracyM: _a,
    locatedByUserId: _b,
    locatedAt,
    previousLatitude,
    previousLongitude,
    ...rest
  } = row;
  return {
    ...rest,
    locatedAt: locatedAt ? locatedAt.toISOString() : null,
    hasPreviousLocation: previousLatitude !== null && previousLongitude !== null,
  };
};

/** One customer identity across leads, quotations and projects (PRD 3.2). */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly leads: LeadsService,
  ) {}

  async list(search?: string): Promise<Customer[]> {
    const term = search ? `%${search}%` : null;
    const rows = await this.db
      .select()
      .from(customers)
      .where(term ? or(ilike(customers.name, term), ilike(customers.phoneE164, term)) : undefined)
      .orderBy(asc(customers.name));
    return this.present(rows);
  }

  async get(id: string) {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!row) throw notFound('That customer');
    const [customer] = await this.present([row]);
    if (!customer) throw notFound('That customer');
    const propertyRows = await this.db
      .select()
      .from(properties)
      .where(eq(properties.customerId, id))
      .orderBy(asc(properties.createdAt));
    return {
      ...customer,
      properties: propertyRows.map(presentProperty),
      quotations: await quotationSummaries(this.db, eq(quotations.customerId, id)),
      projects: await projectSummaries(this.db, eq(projects.customerId, id)),
      accounts: await otherAccounts(this.db, row.phoneE164),
    };
  }

  async update(actor: Actor, id: string, patch: CustomerPatch): Promise<Customer> {
    await editCustomer(this.db, actor, id, patch);
    const rows = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    const [customer] = await this.present(rows);
    if (!customer) throw notFound('That customer');
    return customer;
  }

  /**
   * Matches the lead to an existing customer by phone (no duplicate identities), then adds
   * the site, or reuses one of that customer's sites (PRD 3.3: property matching).
   */
  async convertLead(
    actor: Actor,
    leadId: string,
    kind: 'individual' | 'organization',
    site: { property?: PropertyInput | undefined; propertyId?: string | undefined },
  ) {
    const lead = await this.leads.get(actor, leadId);
    const result = await savingSite('property.consumerNumber', () =>
      this.db.transaction(async (tx) => {
        let [customer] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.phoneE164, lead.phone))
          .limit(1);
        const matched = Boolean(customer);
        if (!customer) {
          [customer] = await tx
            .insert(customers)
            .values({
              kind,
              name: lead.name,
              phoneE164: lead.phone,
              email: lead.email,
              createdByUserId: actor.userId,
            })
            .returning({ id: customers.id });
        }
        if (!customer) throw new Error('Customer insert returned nothing.');
        const propertyId = await this.siteFor(tx, actor, customer.id, site);
        await recordAudit(tx, actor.userId, 'lead.converted', 'lead', leadId, {
          customerId: customer.id,
          propertyId,
          reusedProperty: Boolean(site.propertyId),
        });
        const who = matched ? 'Matched to the existing customer' : 'Converted to a customer';
        const where = site.propertyId ? 'their site on file' : 'a new site';
        await logLead(tx, leadId, actor.userId, 'note', `${who}, with ${where}.`);
        return { customerId: customer.id, propertyId };
      }),
    );
    await this.leads.link(leadId, result.customerId, result.propertyId);
    return result;
  }

  /** A site of this customer picked by id, or a new one from the form. */
  private async siteFor(
    tx: DatabaseExecutor,
    actor: Actor,
    customerId: string,
    site: { property?: PropertyInput | undefined; propertyId?: string | undefined },
  ): Promise<string> {
    if (site.propertyId) {
      const [own] = await tx
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.id, site.propertyId), eq(properties.customerId, customerId)))
        .limit(1);
      if (!own) throw invalid('That site belongs to someone else.', { propertyId: 'Pick again.' });
      return own.id;
    }
    if (!site.property) throw invalid('Add the site address.');
    return insertLeadSite(tx, actor, customerId, site.property);
  }

  async property(id: string): Promise<typeof properties.$inferSelect> {
    const [row] = await this.db.select().from(properties).where(eq(properties.id, id)).limit(1);
    if (!row) throw notFound('That property');
    return row;
  }

  /** A property with its customer, for screens that start from a property. */
  async propertyWithCustomer(id: string): Promise<Property & { customer: Customer }> {
    const row = await this.property(id);
    const owners = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, row.customerId))
      .limit(1);
    const [customer] = await this.present(owners);
    if (!customer) throw notFound('That customer');
    return { ...presentProperty(row), customer };
  }

  /** Another site for a customer who already has one (PRD 3.2: a customer can have several). */
  async addProperty(actor: Actor, customerId: string, input: PropertyInput): Promise<Property> {
    const [customer] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw notFound('That customer');
    return presentProperty(await this.property(await addSite(this.db, actor, customerId, input)));
  }

  async updateProperty(actor: Actor, id: string, patch: Patch<PropertyInput>): Promise<Property> {
    await editSite(this.db, actor, await this.property(id), patch);
    return presentProperty(await this.property(id));
  }

  private async present(rows: Array<typeof customers.$inferSelect>): Promise<Customer[]> {
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];
    const propertyCounts = await this.db
      .select({ id: properties.customerId, count: sql<number>`count(*)::int` })
      .from(properties)
      .where(inArray(properties.customerId, ids))
      .groupBy(properties.customerId);
    const projectCounts = await this.db
      .select({ id: projects.customerId, count: sql<number>`count(*)::int` })
      .from(projects)
      .where(inArray(projects.customerId, ids))
      .groupBy(projects.customerId);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      phone: row.phoneE164,
      email: row.email,
      gstin: row.gstin,
      createdAt: row.createdAt.toISOString(),
      propertyCount: propertyCounts.find((count) => count.id === row.id)?.count ?? 0,
      projectCount: projectCounts.find((count) => count.id === row.id)?.count ?? 0,
    }));
  }
}
