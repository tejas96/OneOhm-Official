import type { Bonus } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  payables,
  projectBonuses,
  projectBonusShares,
  projects,
  users,
} from '@oneohm/database';
import { desc, eq, inArray, type SQL } from 'drizzle-orm';

type BonusRow = typeof projectBonuses.$inferSelect;

/** Bonuses with their project, people, shares and how far each payable has got. */
export async function readBonuses(db: DatabaseExecutor, where?: SQL): Promise<Bonus[]> {
  const rows = await db
    .select({ bonus: projectBonuses, code: projects.code, name: projects.name })
    .from(projectBonuses)
    .leftJoin(projects, eq(projects.id, projectBonuses.projectId))
    .where(where)
    .orderBy(desc(projectBonuses.createdAt))
    .limit(200);
  if (rows.length === 0) return [];
  const shares = await db
    .select({
      share: projectBonusShares,
      fullName: users.fullName,
      payableStatus: payables.status,
      paidOn: payables.paidOn,
    })
    .from(projectBonusShares)
    .innerJoin(users, eq(users.id, projectBonusShares.userId))
    .leftJoin(payables, eq(payables.id, projectBonusShares.payableId))
    .where(
      inArray(
        projectBonusShares.bonusId,
        rows.map((row) => row.bonus.id),
      ),
    );
  const names = await namesOf(
    db,
    rows.flatMap(({ bonus }) => [bonus.proposedByUserId, bonus.decidedByUserId]),
  );
  return rows.map(({ bonus, code, name }) => ({
    id: bonus.id,
    project: bonus.projectId && code ? { id: bonus.projectId, code, name: name ?? code } : null,
    reason: bonus.reason,
    totalPaise: bonus.totalPaise,
    status: bonus.status,
    proposedBy: ref(names, bonus.proposedByUserId),
    decidedBy: ref(names, bonus.decidedByUserId),
    decidedAt: bonus.decidedAt?.toISOString() ?? null,
    decisionNote: bonus.decisionNote,
    createdAt: bonus.createdAt.toISOString(),
    shares: shares
      .filter((row) => row.share.bonusId === bonus.id)
      .map((row) => ({
        user: { id: row.share.userId, fullName: row.fullName },
        shares: row.share.shares,
        amountPaise: row.share.amountPaise,
        payableStatus: row.payableStatus ?? null,
        paidOn: row.paidOn ?? null,
      })),
  }));
}

async function namesOf(db: DatabaseExecutor, ids: readonly (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(inArray(users.id, wanted));
  return new Map(rows.map((row) => [row.id, row.fullName]));
}

const ref = (names: Map<string, string>, id: string | null) =>
  id ? { id, fullName: names.get(id) ?? '' } : null;

/** One person's shares of bonuses (not cancelled), newest first, for their own rewards. */
export async function bonusesOf(db: DatabaseExecutor, userId: string) {
  const rows = await db
    .select({
      bonus: projectBonuses,
      share: projectBonusShares,
      code: projects.code,
      payableStatus: payables.status,
      paidOn: payables.paidOn,
    })
    .from(projectBonusShares)
    .innerJoin(projectBonuses, eq(projectBonuses.id, projectBonusShares.bonusId))
    .leftJoin(projects, eq(projects.id, projectBonuses.projectId))
    .leftJoin(payables, eq(payables.id, projectBonusShares.payableId))
    .where(eq(projectBonusShares.userId, userId))
    .orderBy(desc(projectBonuses.createdAt))
    .limit(50);
  return rows
    .filter(({ bonus }) => bonus.status === 'approved' || bonus.status === 'pending')
    .map(({ bonus, share, code, payableStatus, paidOn }) =>
      present(bonus, share, code, {
        payableStatus: payableStatus ?? null,
        paidOn: paidOn ?? null,
      }),
    );
}

function present(
  bonus: BonusRow,
  share: typeof projectBonusShares.$inferSelect,
  code: string | null,
  money: { payableStatus: 'pending' | 'approved' | 'paid' | null; paidOn: string | null },
) {
  return {
    id: bonus.id,
    reason: bonus.reason,
    projectCode: code,
    amountPaise: share.amountPaise,
    status: bonus.status,
    ...money,
    createdAt: bonus.createdAt.toISOString(),
  };
}
