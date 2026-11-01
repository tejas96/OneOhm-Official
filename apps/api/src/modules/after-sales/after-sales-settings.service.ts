import { Inject, Injectable } from '@nestjs/common';
import type {
  AmcPlan,
  AmcPlanInput,
  ServiceCategory,
  ServiceCategoryInput,
  WarrantyPolicyInput,
  WarrantySettings,
} from '@oneohm/api-contracts';
import { amcContracts, amcPlans, serviceCategories, users, warrantyPolicy } from '@oneohm/database';
import { categoryKeyFrom } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { warrantyPolicyOf } from './installed-assets.record';

type CategoryRow = typeof serviceCategories.$inferSelect;

/** A visit's resolution clock starts on the visit day, so only requests need this check. */
function assertHours(input: ServiceCategoryInput, system: boolean): void {
  if (!system && input.resolutionHours < input.responseHours) {
    throw invalid('Some details need fixing.', {
      resolutionHours: 'Resolution cannot be promised sooner than the first response.',
    });
  }
}
const toCategory = ({ createdAt: _c, updatedAt: _u, position: _p, ...row }: CategoryRow) => row;

/** Settings → Service and SLAs, Warranty and AMC plans (PRD 7.2). */
@Injectable()
export class AfterSalesSettingsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async categories(): Promise<ServiceCategory[]> {
    const rows = await this.db
      .select()
      .from(serviceCategories)
      .orderBy(asc(serviceCategories.position), asc(serviceCategories.createdAt));
    return rows.map(toCategory);
  }

  async createCategory(actorId: string, input: ServiceCategoryInput): Promise<ServiceCategory> {
    assertHours(input, false);
    const key = categoryKeyFrom(input.label);
    const [taken] = await this.db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(eq(serviceCategories.key, key));
    if (taken) throw invalid('A category with this name already exists.', { label: 'Taken.' });
    const [{ last } = { last: 0 }] = await this.db
      .select({ last: sql<number>`coalesce(max(${serviceCategories.position}), 0)::int` })
      .from(serviceCategories);
    const [row] = await this.db
      .insert(serviceCategories)
      .values({ ...input, key, position: last + 1 })
      .returning();
    if (!row) throw new Error('Category was not saved.');
    await recordAudit(this.db, actorId, 'service_category.created', 'service_category', row.id, {
      ...input,
    });
    return toCategory(row);
  }

  async updateCategory(
    actorId: string,
    id: string,
    input: ServiceCategoryInput,
  ): Promise<ServiceCategory> {
    const [current] = await this.db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.id, id));
    if (!current) throw notFound('That category');
    assertHours(input, current.system);
    if (current.system && !input.active) {
      throw invalid('Maintenance visits are always in use.', { active: 'Always on.' });
    }
    if (!input.active && current.key === 'other') {
      throw invalid('"Something else" catches every request, so it stays in use.', {
        active: 'Always on.',
      });
    }
    const [row] = await this.db
      .update(serviceCategories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(serviceCategories.id, id))
      .returning();
    if (!row) throw notFound('That category');
    await recordAudit(this.db, actorId, 'service_category.updated', 'service_category', id, {
      ...input,
    });
    return toCategory(row);
  }

  async warranty(): Promise<WarrantySettings> {
    const [row] = await this.db
      .select({ updatedAt: warrantyPolicy.updatedAt, by: users.fullName })
      .from(warrantyPolicy)
      .leftJoin(users, eq(users.id, warrantyPolicy.updatedByUserId))
      .where(eq(warrantyPolicy.id, 'default'));
    return {
      policy: await warrantyPolicyOf(this.db),
      updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
      updatedBy: row?.by ?? null,
    };
  }

  async saveWarranty(actorId: string, policy: WarrantyPolicyInput): Promise<WarrantySettings> {
    // Only panels carry a separate performance warranty.
    const clean = {
      ...policy,
      inverter: { ...policy.inverter, performanceYears: null },
      battery: { ...policy.battery, performanceYears: null },
      structure: { ...policy.structure, performanceYears: null },
      workmanship: { ...policy.workmanship, performanceYears: null },
    };
    const values = { policy: clean, updatedByUserId: actorId, updatedAt: new Date() };
    await this.db
      .insert(warrantyPolicy)
      .values({ id: 'default', ...values })
      .onConflictDoUpdate({ target: warrantyPolicy.id, set: values });
    await recordAudit(this.db, actorId, 'warranty_policy.updated', 'warranty_policy', 'default', {
      policy: clean,
    });
    return this.warranty();
  }

  async plans(): Promise<AmcPlan[]> {
    const running = this.db
      .select({ planId: amcContracts.planId, count: sql<number>`count(*)::int`.as('count') })
      .from(amcContracts)
      .where(and(isNull(amcContracts.cancelledAt), gte(amcContracts.endsOn, todayIn())))
      .groupBy(amcContracts.planId)
      .as('running');
    const rows = await this.db
      .select({ plan: amcPlans, count: running.count })
      .from(amcPlans)
      .leftJoin(running, eq(running.planId, amcPlans.id))
      .orderBy(desc(amcPlans.active), asc(amcPlans.pricePaise), asc(amcPlans.name));
    return rows.map(({ plan, count }) => ({
      id: plan.id,
      name: plan.name,
      pricePaise: plan.pricePaise,
      visitsPerYear: plan.visitsPerYear,
      durationMonths: plan.durationMonths,
      visitName: plan.visitName,
      includes: plan.includes,
      active: plan.active,
      activeContracts: count ?? 0,
    }));
  }

  async savePlan(actorId: string, id: string | null, input: AmcPlanInput): Promise<AmcPlan> {
    const values = {
      ...input,
      visitName: input.visitName.toLowerCase(),
      includes: input.includes.filter((item) => item.trim().length > 0),
    };
    const [row] = id
      ? await this.db
          .update(amcPlans)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(amcPlans.id, id))
          .returning({ id: amcPlans.id })
      : await this.db.insert(amcPlans).values(values).returning({ id: amcPlans.id });
    if (!row) throw notFound('That plan');
    await recordAudit(
      this.db,
      actorId,
      id ? 'amc_plan.updated' : 'amc_plan.created',
      'amc_plan',
      row.id,
      {
        ...values,
      },
    );
    const saved = (await this.plans()).find((plan) => plan.id === row.id);
    if (!saved) throw notFound('That plan');
    return saved;
  }
}
