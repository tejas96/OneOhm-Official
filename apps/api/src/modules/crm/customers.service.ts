import { Inject, Injectable } from '@nestjs/common';
import type { Customer, Property, PropertyInput } from '@oneohm/api-contracts';
import { customers, projects, properties, quotations } from '@oneohm/database';
import { asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { projectSummaries } from '../../common/read-models/project-summary';
import { quotationSummaries } from '../../common/read-models/quotation-summary';
import { DATABASE, type Database } from '../../config/core.module';
import { LeadsService } from './leads.service';

const presentProperty = (row: typeof properties.$inferSelect): Property => {
  const {
    createdAt: _c,
    updatedAt: _u,
    version: _v,
    latitude: _lat,
    longitude: _lng,
    ...rest
  } = row;
  return rest;
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
      .where(eq(properties.customerId, id));
    return {
      ...customer,
      properties: propertyRows.map(presentProperty),
      quotations: await quotationSummaries(this.db, eq(quotations.customerId, id)),
      projects: await projectSummaries(this.db, eq(projects.customerId, id)),
    };
  }

  /** Matches the lead to an existing customer by phone (no duplicate identities), adds the property. */
  async convertLead(
    actor: Actor,
    leadId: string,
    kind: 'individual' | 'organization',
    property: PropertyInput,
  ) {
    const lead = await this.leads.get(actor, leadId);
    const result = await this.db.transaction(async (tx) => {
      let [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.phoneE164, lead.phone))
        .limit(1);
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
      const [created] = await tx
        .insert(properties)
        .values({ customerId: customer.id, ...property, households: property.households ?? null })
        .returning({ id: properties.id });
      if (!created) throw new Error('Property insert returned nothing.');
      await recordAudit(tx, actor.userId, 'lead.converted', 'lead', leadId, {
        customerId: customer.id,
        propertyId: created.id,
      });
      return { customerId: customer.id, propertyId: created.id };
    });
    await this.leads.link(leadId, result.customerId, result.propertyId);
    return result;
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

  async updateProperty(actor: Actor, id: string, patch: Patch<PropertyInput>): Promise<Property> {
    await this.property(id);
    await this.db
      .update(properties)
      .set({ ...definedOnly(patch), updatedAt: new Date() })
      .where(eq(properties.id, id));
    await recordAudit(this.db, actor.userId, 'property.updated', 'property', id, patch);
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
      createdAt: row.createdAt.toISOString(),
      propertyCount: propertyCounts.find((count) => count.id === row.id)?.count ?? 0,
      projectCount: projectCounts.find((count) => count.id === row.id)?.count ?? 0,
    }));
  }
}
