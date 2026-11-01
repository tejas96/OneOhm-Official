import { eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from './client';
import type { PendingApprovalRow } from './pending-approvals';
import { commissionEntries } from './schema/commissions.schema';
import { customers } from './schema/crm.schema';
import { projectBonuses, projectBonusShares } from './schema/engagement.schema';
import { users } from './schema/identity.schema';
import { projects } from './schema/projects.schema';
import { referralRewards } from './schema/referrals.schema';

const iso = (value: Date) => value.toISOString();

/** Bonuses, reseller commissions and customer referral rewards waiting for a yes. */
export async function rewardRows(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const bonuses = await db
    .select({
      id: projectBonuses.id,
      at: projectBonuses.createdAt,
      by: projectBonuses.proposedByUserId,
      reason: projectBonuses.reason,
      amount: projectBonuses.totalPaise,
      name: users.fullName,
      projectId: projectBonuses.projectId,
      code: projects.code,
    })
    .from(projectBonuses)
    .leftJoin(users, eq(users.id, projectBonuses.proposedByUserId))
    .leftJoin(projects, eq(projects.id, projectBonuses.projectId))
    .where(eq(projectBonuses.status, 'pending'));
  const shares = bonuses.length
    ? await db
        .select({ bonusId: projectBonusShares.bonusId, userId: projectBonusShares.userId })
        .from(projectBonusShares)
        .where(
          inArray(
            projectBonusShares.bonusId,
            bonuses.map((row) => row.id),
          ),
        )
    : [];
  const reseller = alias(users, 'reseller');
  const commissions = await db
    .select({
      id: commissionEntries.id,
      at: commissionEntries.earnedAt,
      by: commissionEntries.resellerUserId,
      amount: commissionEntries.amountPaise,
      name: reseller.fullName,
      projectId: commissionEntries.projectId,
      code: projects.code,
    })
    .from(commissionEntries)
    .innerJoin(reseller, eq(reseller.id, commissionEntries.resellerUserId))
    .innerJoin(projects, eq(projects.id, commissionEntries.projectId))
    .where(eq(commissionEntries.status, 'pending'));
  const referrals = await db
    .select({
      id: referralRewards.id,
      at: referralRewards.earnedAt,
      amount: referralRewards.amountPaise,
      name: customers.name,
      projectId: referralRewards.projectId,
      code: projects.code,
    })
    .from(referralRewards)
    .innerJoin(customers, eq(customers.id, referralRewards.referrerCustomerId))
    .innerJoin(projects, eq(projects.id, referralRewards.projectId))
    .where(eq(referralRewards.status, 'pending'));
  return [
    ...bonuses.map((row) => ({
      kind: 'bonus' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.by,
      excludedUserIds: shares.filter((s) => s.bonusId === row.id).map((s) => s.userId),
      amountPaise: row.amount,
      subject: row.reason,
      requesterName: row.name,
      projectId: row.projectId,
      projectCode: row.code,
    })),
    ...commissions.map((row) => ({
      kind: 'commission' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.by,
      amountPaise: row.amount,
      subject: row.name,
      requesterName: row.name,
      projectId: row.projectId,
      projectCode: row.code,
    })),
    ...referrals.map((row) => ({
      kind: 'referral_reward' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: null,
      amountPaise: row.amount,
      subject: row.name,
      requesterName: null,
      projectId: row.projectId,
      projectCode: row.code,
    })),
  ];
}
