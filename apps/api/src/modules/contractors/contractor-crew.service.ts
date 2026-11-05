import { Inject, Injectable } from '@nestjs/common';
import type { ContractorDetail, ContractorRate, CrewCandidate } from '@oneohm/api-contracts';
import { contractorMembers, contractorRates, roles, userRoles, users } from '@oneohm/database';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { definedOnly } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';
import { ContractorsService, presentRate } from './contractors.service';

/** A contractor's crew (partner-role people) and rate card. */
@Injectable()
export class ContractorCrewService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly contractors: ContractorsService,
  ) {}

  /** People who can join a crew: active users holding a partner-kind role. */
  async crewCandidates(): Promise<CrewCandidate[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        fullName: users.fullName,
        phone: users.phoneE164,
        roleName: roles.name,
        contractorId: contractorMembers.contractorId,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
      .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
      .where(and(eq(users.status, 'active'), eq(roles.kind, 'partner')))
      .orderBy(asc(users.fullName));
    const byUser = new Map<string, CrewCandidate>();
    for (const row of rows) {
      const existing = byUser.get(row.userId);
      byUser.set(row.userId, {
        userId: row.userId,
        fullName: row.fullName,
        phone: row.phone,
        contractorId: row.contractorId,
        roleNames: [...(existing?.roleNames ?? []), row.roleName],
      });
    }
    return [...byUser.values()];
  }

  async setMembers(
    actor: Actor,
    id: string,
    members: readonly { userId: string; lead: boolean }[],
  ): Promise<ContractorDetail> {
    await this.contractors.get(actor, id);
    const allowed = new Set((await this.crewCandidates()).map((candidate) => candidate.userId));
    const outsider = members.find((member) => !allowed.has(member.userId));
    if (outsider)
      throw invalid('Crew members need an active partner role (for example I&C partner).');
    const lead = members.find((member) => member.lead) ?? members[0];
    await this.db.transaction(async (tx) => {
      await tx.delete(contractorMembers).where(eq(contractorMembers.contractorId, id));
      for (const member of members) {
        await tx.delete(contractorMembers).where(eq(contractorMembers.userId, member.userId));
        await tx.insert(contractorMembers).values({
          contractorId: id,
          userId: member.userId,
          lead: member.userId === lead?.userId,
        });
      }
      await recordAudit(tx, actor.userId, 'contractor.crew_set', 'contractor', id, {
        members: members.length,
      });
    });
    return this.contractors.get(actor, id);
  }

  async addRate(
    actor: Actor,
    contractorId: string,
    input: Omit<ContractorRate, 'id' | 'active' | 'taskKey' | 'projectType'> & {
      taskKey?: string | null | undefined;
      projectType?: ContractorRate['projectType'] | undefined;
    },
  ): Promise<ContractorRate> {
    await this.contractors.get(actor, contractorId);
    if (input.basis === 'per_task' && !input.taskKey)
      throw invalid('Pick the task this rate pays for.', { taskKey: 'Pick a task.' });
    const [rate] = await this.db
      .insert(contractorRates)
      .values({
        contractorId,
        basis: input.basis,
        taskKey: input.basis === 'per_task' ? (input.taskKey ?? null) : null,
        projectType: input.projectType ?? null,
        label: input.label,
        amountPaise: input.amountPaise,
      })
      .returning();
    if (!rate) throw new Error('Rate insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'contractor.rate_added', 'contractor', contractorId, {
      basis: input.basis,
      amountPaise: input.amountPaise,
    });
    return presentRate(rate);
  }

  async updateRate(
    actor: Actor,
    id: string,
    patch: {
      label?: string | undefined;
      amountPaise?: number | undefined;
      active?: boolean | undefined;
    },
  ): Promise<ContractorRate> {
    const [rate] = await this.db
      .update(contractorRates)
      .set({ ...definedOnly(patch), updatedAt: new Date() })
      .where(eq(contractorRates.id, id))
      .returning();
    if (!rate) throw notFound('That rate');
    await recordAudit(
      this.db,
      actor.userId,
      'contractor.rate_updated',
      'contractor_rate',
      id,
      patch,
    );
    return presentRate(rate);
  }
}
