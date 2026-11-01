import { Inject, Injectable } from '@nestjs/common';
import type { IncentiveFilter, PayoutInput, ReferralReward } from '@oneohm/api-contracts';
import {
  customers,
  leads,
  postIncentiveApproved,
  postIncentivePaid,
  projects,
  referralRewards,
  users,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, desc, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { outMethod, statusCondition } from './incentive-shared';
import { evaluateReferralRewards } from './referral-evaluation';
import { announceReward } from './referral-messages';

type Status = ReferralReward['status'];

/** Referral rewards for finance: approve (books the expense), pay, or turn down. */
@Injectable()
export class ReferralRewardsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(filter: IncentiveFilter, id?: string): Promise<ReferralReward[]> {
    if (!id) await evaluateReferralRewards(this.db);
    const rows = await this.db
      .select({
        reward: referralRewards,
        referrer: { id: customers.id, name: customers.name, phone: customers.phoneE164 },
        friendName: leads.name,
        projectCode: projects.code,
        approver: users.fullName,
      })
      .from(referralRewards)
      .innerJoin(customers, eq(customers.id, referralRewards.referrerCustomerId))
      .innerJoin(leads, eq(leads.id, referralRewards.leadId))
      .innerJoin(projects, eq(projects.id, referralRewards.projectId))
      .leftJoin(users, eq(users.id, referralRewards.approvedByUserId))
      .where(
        and(
          statusCondition(referralRewards.status, filter),
          id ? eq(referralRewards.id, id) : undefined,
        ),
      )
      .orderBy(desc(referralRewards.earnedAt));
    return rows.map(({ reward, referrer, friendName, projectCode, approver }) => ({
      id: reward.id,
      status: reward.status,
      amountPaise: reward.amountPaise,
      qualifyingEvent: reward.qualifyingEvent,
      earnedAt: reward.earnedAt.toISOString(),
      approvedAt: reward.approvedAt?.toISOString() ?? null,
      approvedBy:
        reward.approvedByUserId && approver
          ? { id: reward.approvedByUserId, fullName: approver }
          : null,
      rejectReason: reward.rejectReason,
      paidOn: reward.paidOn,
      paidMethod: outMethod(reward.paidMethod),
      paidReference: reward.paidReference,
      referrer,
      friendName,
      leadId: reward.leadId,
      projectId: reward.projectId,
      projectCode,
      capacityWp: reward.capacityWp,
      basis: reward.basis,
      ratePaise: reward.ratePaise,
    }));
  }

  async get(id: string): Promise<ReferralReward> {
    const [reward] = await this.list('all', id);
    if (!reward) throw notFound('That reward');
    return reward;
  }

  async approve(actor: Actor, id: string): Promise<ReferralReward> {
    await this.step(actor, id, 'pending', {
      status: 'approved',
      approvedAt: new Date(),
      approvedByUserId: actor.userId,
    });
    return this.get(id);
  }

  async reject(actor: Actor, id: string, reason: string): Promise<ReferralReward> {
    await this.step(actor, id, 'pending', {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedByUserId: actor.userId,
      rejectReason: reason,
    });
    return this.get(id);
  }

  async pay(actor: Actor, id: string, input: PayoutInput): Promise<ReferralReward> {
    await this.step(actor, id, 'approved', {
      status: 'paid',
      paidAt: new Date(),
      paidOn: input.paidOn,
      paidMethod: input.method,
      paidReference: input.reference ?? null,
      paidByUserId: actor.userId,
    });
    return this.get(id);
  }

  /** Moves a reward on from `from`, books the ledger, audits and tells the customer. */
  private async step(
    actor: Actor,
    id: string,
    from: Status,
    change: Partial<typeof referralRewards.$inferInsert> & { status: Status },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(referralRewards)
        .set({ ...change, updatedAt: new Date() })
        .where(and(eq(referralRewards.id, id), eq(referralRewards.status, from)))
        .returning({ amountPaise: referralRewards.amountPaise });
      if (!updated) throw await this.notReady(id, from);
      if (change.status === 'approved') {
        await postIncentiveApproved(tx, 'referral_reward', id, actor.userId);
      }
      if (change.status === 'paid')
        await postIncentivePaid(tx, 'referral_reward', id, actor.userId);
      await recordAudit(
        tx,
        actor.userId,
        `referral_reward.${change.status}`,
        'referral_reward',
        id,
        {
          amountPaise: updated.amountPaise,
          ...(change.paidMethod ? { method: change.paidMethod } : {}),
          ...(change.rejectReason ? { reason: change.rejectReason } : {}),
        },
      );
      await announceReward(tx, id, actor.userId);
    });
  }

  private async notReady(id: string, from: Status) {
    const [row] = await this.db
      .select({ status: referralRewards.status, amountPaise: referralRewards.amountPaise })
      .from(referralRewards)
      .where(eq(referralRewards.id, id))
      .limit(1);
    if (!row) return notFound('That reward');
    if (from === 'approved' && row.status === 'pending') {
      return conflict(
        `This ${formatInr(row.amountPaise)} reward needs approval before it is paid.`,
      );
    }
    return conflict(`This reward is already ${row.status}.`);
  }
}
