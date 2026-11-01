import { Inject, Injectable } from '@nestjs/common';
import type { Bonus, BonusInput } from '@oneohm/api-contracts';
import {
  type Notice,
  notify,
  notifyHolders,
  payables,
  postBonusPayableApproved,
  projectBonuses,
  projectBonusShares,
  projects,
  roles,
  type Transaction,
  userRoles,
  users,
} from '@oneohm/database';
import { type BonusProblem, checkBonus, splitBonus } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { assertWithinApprovalLimit } from '../business-settings/approval-limit';
import { readBonuses } from './bonus-read';

const PROBLEMS: Readonly<Record<BonusProblem, [string, string, string]>> = {
  amount: ['Enter an amount up to ₹5,00,000.', 'totalPaise', 'Check the amount.'],
  nobody: ['Add at least one person.', 'people', 'Nobody added.'],
  shares: ['Each share is a whole number of 1 or more.', 'people', 'Check the shares.'],
  duplicate: ['Each person once only.', 'people', 'Listed twice.'],
  too_small: ['Each person needs at least ₹1.', 'totalPaise', 'Too small to share.'],
};

const NOTICES = {
  proposed: (id: string, reason: string, total: number): Notice => ({
    kind: 'bonus_proposed',
    title: 'Bonus to approve',
    body: `${formatInr(total)}: ${reason}`,
    subject: { type: 'points', id },
    dedupeKey: `bonus_proposed:${id}`,
  }),
  approved: (id: string, userId: string, amount: number, reason: string): Notice => ({
    kind: 'bonus_approved',
    title: `Bonus approved: ${formatInr(amount)}`,
    body: `${reason}. Finance pays it next.`,
    subject: { type: 'points', id },
    dedupeKey: `bonus_approved:${id}:${userId}`,
  }),
};

/**
 * Project bonuses and incentives (PRD 3.12, 4.7). Someone who manages people or projects
 * proposes one; someone who approves payments decides it. Approved, each share becomes
 * a payable to that employee, booked as a staff bonus, and finance pays it as usual.
 */
@Injectable()
export class BonusesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(where?: SQL): Promise<Bonus[]> {
    return readBonuses(this.db, where);
  }

  async propose(actor: Actor, input: BonusInput): Promise<Bonus> {
    const problem = checkBonus({ totalPaise: input.totalPaise, people: input.people });
    if (problem) {
      const [message, field, hint] = PROBLEMS[problem];
      throw invalid(message, { [field]: hint });
    }
    await this.assertStaff(input.people.map((person) => person.userId));
    if (input.projectId) {
      const [project] = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, input.projectId));
      if (!project) throw invalid('Pick a project from the list.', { projectId: 'Unknown.' });
    }
    const split = splitBonus(input.totalPaise, input.people);
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(projectBonuses)
        .values({
          projectId: input.projectId ?? null,
          reason: input.reason.trim(),
          totalPaise: input.totalPaise,
          proposedByUserId: actor.userId,
        })
        .returning({ id: projectBonuses.id });
      if (!row) throw new Error('Bonus insert returned nothing.');
      await tx.insert(projectBonusShares).values(
        input.people.map((person, index) => ({
          bonusId: row.id,
          userId: person.userId,
          shares: person.shares,
          amountPaise: split[index]?.amountPaise ?? 0,
        })),
      );
      await notifyHolders(
        tx,
        'finance.approve_payments',
        NOTICES.proposed(row.id, input.reason.trim(), input.totalPaise),
        actor.userId,
      );
      await recordAudit(tx, actor.userId, 'bonus.proposed', 'project_bonus', row.id, {
        totalPaise: input.totalPaise,
        people: input.people,
      });
      return row.id;
    });
    return this.one(id);
  }

  async decide(actor: Actor, id: string, approve: boolean, note?: string | null): Promise<Bonus> {
    await this.db.transaction(async (tx) => {
      const bonus = await this.pending(tx, id);
      await assertWithinApprovalLimit(tx, actor, 'bonus', bonus.totalPaise);
      const shares = await tx
        .select()
        .from(projectBonusShares)
        .where(eq(projectBonusShares.bonusId, id));
      if (shares.some((share) => share.userId === actor.userId))
        throw conflict('Someone else approves a bonus that includes you.', 'own');
      if (approve) {
        for (const share of shares) await this.payShare(tx, actor, bonus, share);
      }
      await tx
        .update(projectBonuses)
        .set({
          status: approve ? 'approved' : 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: note?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(projectBonuses.id, id));
      await recordAudit(
        tx,
        actor.userId,
        `bonus.${approve ? 'approved' : 'rejected'}`,
        'project_bonus',
        id,
        { totalPaise: bonus.totalPaise },
      );
    });
    return this.one(id);
  }

  /** The proposer, or anyone who approves payments, may withdraw a pending bonus. */
  async cancel(actor: Actor, id: string): Promise<Bonus> {
    await this.db.transaction(async (tx) => {
      const bonus = await this.pending(tx, id);
      if (bonus.proposedByUserId !== actor.userId && !can(actor, 'finance.approve_payments'))
        throw forbidden('Only the person who proposed it can withdraw it.');
      await tx
        .update(projectBonuses)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(projectBonuses.id, id));
      await recordAudit(tx, actor.userId, 'bonus.cancelled', 'project_bonus', id);
    });
    return this.one(id);
  }

  /** One share as money owed to the employee, booked in the ledger at once. */
  private async payShare(
    tx: Transaction,
    actor: Actor,
    bonus: typeof projectBonuses.$inferSelect,
    share: typeof projectBonusShares.$inferSelect,
  ): Promise<void> {
    const [person] = await tx
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, share.userId));
    const now = new Date();
    const [payable] = await tx
      .insert(payables)
      .values({
        projectId: bonus.projectId,
        party: 'employee',
        partyName: person?.fullName ?? 'Employee',
        partyUserId: share.userId,
        description: `Bonus · ${bonus.reason}`,
        amountPaise: share.amountPaise,
        dueOn: todayIn(),
        status: 'approved',
        approvedByUserId: actor.userId,
        approvedAt: now,
      })
      .returning({ id: payables.id });
    if (!payable) throw new Error('Payable insert returned nothing.');
    await postBonusPayableApproved(tx, payable.id, actor.userId);
    await tx
      .update(projectBonusShares)
      .set({ payableId: payable.id })
      .where(eq(projectBonusShares.id, share.id));
    await notify(
      tx,
      { userId: share.userId },
      NOTICES.approved(bonus.id, share.userId, share.amountPaise, bonus.reason),
    );
  }

  private async pending(tx: Transaction, id: string) {
    const [bonus] = await tx
      .select()
      .from(projectBonuses)
      .where(eq(projectBonuses.id, id))
      .for('update')
      .limit(1);
    if (!bonus) throw notFound('That bonus');
    if (bonus.status !== 'pending') throw conflict('This bonus has already been decided.');
    return bonus;
  }

  /** Bonuses are for employees: active people with a staff role. */
  private async assertStaff(ids: readonly string[]): Promise<void> {
    const found = await this.db
      .selectDistinct({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
      .where(and(inArray(users.id, [...ids]), eq(users.status, 'active')));
    if (found.length !== new Set(ids).size)
      throw invalid('Bonuses are for active employees only.', { people: 'Check the people.' });
  }

  private async one(id: string): Promise<Bonus> {
    const [bonus] = await readBonuses(this.db, eq(projectBonuses.id, id));
    if (!bonus) throw notFound('That bonus');
    return bonus;
  }
}
