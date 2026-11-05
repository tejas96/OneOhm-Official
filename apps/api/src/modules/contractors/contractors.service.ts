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
import { maskAccount, tdsRateForPayee } from '@oneohm/domain';
import { asc, eq, ilike, or, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';
import { bankAfterSave, bankFieldsOf, recordBankChange } from '../bank-payouts/bank-hold';
import { assertNameWithNumber } from '../banking/bank-input';
import { payeeBankViews } from '../inventory/payee-bank-view';
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
  // The second typing of the number is checked by the schema and never stored.
  const { phone, bankAccountNumber, bankAccountNumberConfirm: _confirm, ...rest } = input;
  return definedOnly({
    ...rest,
    ...(phone === undefined ? {} : { phoneE164: phone }),
    // The number is write-only: empty keeps what is saved.
    ...(bankAccountNumber ? { bankAccountNumber } : {}),
  });
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

  async get(actor: Actor, id: string): Promise<ContractorDetail> {
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
    const bank = (await payeeBankViews(this.db, actor, 'contractor', [row])).get(id);
    const tdsBp = await contractorTdsBp(this.db, row.tdsBp);
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
      bankAccountMasked: row.bankAccountNumber ? maskAccount(row.bankAccountNumber) : null,
      bankIfsc: row.bankIfsc,
      bankHold: bank?.bankHold ?? null,
      bankIsNew: bank?.bankIsNew ?? false,
      paymentTermsDays: row.paymentTermsDays,
      tdsBp,
      effectiveTdsBp: tdsRateForPayee({ rateBp: tdsBp, pan: row.pan }),
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
    assertNameWithNumber(input.bankAccountNumber, input.bankAccountName);
    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(contractors)
        .values({
          ...columns(input),
          name: input.name,
          skills: input.skills,
          serviceAreas: input.serviceAreas,
        })
        .returning({ id: contractors.id });
      if (!created) throw new Error('Contractor insert returned nothing.');
      await recordAudit(tx, actor.userId, 'contractor.created', 'contractor', created.id, {
        name: input.name,
      });
      // Bank details typed in at creation are a first entry: noted, never held.
      await recordBankChange(tx, {
        kind: 'contractor',
        id: created.id,
        payeeName: input.name,
        actor,
        before: {},
        after: bankFieldsOf(columns(input)),
      });
      return created;
    });
    return this.get(actor, row.id);
  }

  async update(
    actor: Actor,
    id: string,
    patch: Patch<ContractorInput> & { active?: boolean | undefined },
  ): Promise<ContractorDetail> {
    if (patch.name) await this.assertNameFree(patch.name, id);
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(contractors)
        .where(eq(contractors.id, id))
        .for('update');
      if (!existing) throw notFound('That contractor');
      assertNameWithNumber(
        patch.bankAccountNumber,
        patch.bankAccountName === undefined ? existing.bankAccountName : patch.bankAccountName,
      );
      const changes = columns(patch);
      await tx
        .update(contractors)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(contractors.id, id));
      await recordAudit(tx, actor.userId, 'contractor.updated', 'contractor', id, {
        fields: Object.keys(definedOnly(patch)),
      });
      await recordBankChange(tx, {
        kind: 'contractor',
        id,
        payeeName: patch.name ?? existing.name,
        actor,
        before: bankFieldsOf(existing),
        after: bankAfterSave(existing, changes),
      });
    });
    return this.get(actor, id);
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
