import { Inject, Injectable } from '@nestjs/common';
import type {
  ContractorDetail,
  ContractorInput,
  ContractorRate,
  ContractorSummary,
} from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractorRates,
  contractors,
  users,
  workOrders,
} from '@oneohm/database';
import { asc, eq, ilike, or, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';
import { contractorPerformance } from './contractor-performance';
import { contractorTdsBp } from './contractor-tds';
import { workOrderSummaries } from './work-order-read';

type Row = typeof contractors.$inferSelect;
type RateRow = typeof contractorRates.$inferSelect;

export const presentRate = (rate: RateRow): ContractorRate => ({
  id: rate.id,
  basis: rate.basis,
  taskKey: rate.taskKey,
  projectType: rate.projectType,
  label: rate.label,
  amountPaise: rate.amountPaise,
  active: rate.active,
});

function columns(input: Patch<ContractorInput>) {
  const { phone, ...rest } = input;
  return definedOnly({ ...rest, ...(phone === undefined ? {} : { phoneE164: phone }) });
}

@Injectable()
export class ContractorsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(search: string | undefined): Promise<ContractorSummary[]> {
    const rows = await this.db
      .select()
      .from(contractors)
      .where(
        search
          ? or(
              ilike(contractors.name, `%${search}%`),
              ilike(contractors.contactName, `%${search}%`),
            )
          : undefined,
      )
      .orderBy(asc(contractors.name));
    const members = await this.db.select().from(contractorMembers);
    const performance = await contractorPerformance(
      this.db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.summary(row, members, performance));
  }

  async get(id: string): Promise<ContractorDetail> {
    const [row] = await this.db.select().from(contractors).where(eq(contractors.id, id));
    if (!row) throw notFound('That contractor');
    const members = await this.db
      .select({ member: contractorMembers, user: users })
      .from(contractorMembers)
      .innerJoin(users, eq(users.id, contractorMembers.userId))
      .where(eq(contractorMembers.contractorId, id))
      .orderBy(asc(users.fullName));
    const rates = await this.db
      .select()
      .from(contractorRates)
      .where(eq(contractorRates.contractorId, id))
      .orderBy(asc(contractorRates.createdAt));
    const performance = await contractorPerformance(this.db, [id]);
    return {
      ...this.summary(
        row,
        members.map((entry) => entry.member),
        performance,
      ),
      email: row.email,
      gstin: row.gstin,
      pan: row.pan,
      address: row.address,
      bankAccountName: row.bankAccountName,
      bankAccountNumber: row.bankAccountNumber,
      bankIfsc: row.bankIfsc,
      paymentTermsDays: row.paymentTermsDays,
      tdsBp: await contractorTdsBp(this.db, row.tdsBp),
      retentionBp: row.retentionBp,
      retentionDays: row.retentionDays,
      notes: row.notes,
      members: members.map(({ member, user }) => ({
        userId: user.id,
        fullName: user.fullName,
        phone: user.phoneE164,
        lead: member.lead,
        active: user.status === 'active',
      })),
      rates: rates.map(presentRate),
      workOrders: await workOrderSummaries(this.db, eq(workOrders.contractorId, id)),
    };
  }

  async create(actor: Actor, input: ContractorInput): Promise<ContractorDetail> {
    await this.assertNameFree(input.name, null);
    const [row] = await this.db
      .insert(contractors)
      .values({
        ...columns(input),
        name: input.name,
        skills: input.skills,
        serviceAreas: input.serviceAreas,
      })
      .returning({ id: contractors.id });
    if (!row) throw new Error('Contractor insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'contractor.created', 'contractor', row.id, {
      name: input.name,
    });
    return this.get(row.id);
  }

  async update(
    actor: Actor,
    id: string,
    patch: Patch<ContractorInput> & { active?: boolean | undefined },
  ): Promise<ContractorDetail> {
    if (patch.name) await this.assertNameFree(patch.name, id);
    const updated = await this.db
      .update(contractors)
      .set({ ...columns(patch), updatedAt: new Date() })
      .where(eq(contractors.id, id))
      .returning({ id: contractors.id });
    if (updated.length === 0) throw notFound('That contractor');
    await recordAudit(this.db, actor.userId, 'contractor.updated', 'contractor', id, {
      fields: Object.keys(definedOnly(patch)),
    });
    return this.get(id);
  }

  private summary(
    row: Row,
    members: readonly { contractorId: string }[],
    performance: Map<string, ContractorSummary['performance']>,
  ): ContractorSummary {
    const stats = performance.get(row.id);
    if (!stats) throw new Error('Missing performance.');
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      contactName: row.contactName,
      phone: row.phoneE164,
      active: row.active,
      skills: row.skills,
      serviceAreas: row.serviceAreas,
      memberCount: members.filter((member) => member.contractorId === row.id).length,
      performance: stats,
    };
  }

  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const [clash] = await this.db
      .select({ id: contractors.id })
      .from(contractors)
      .where(sql`lower(${contractors.name}) = lower(${name})`);
    if (clash && clash.id !== exceptId)
      throw conflict('A contractor with this name already exists.', 'duplicate');
  }
}
