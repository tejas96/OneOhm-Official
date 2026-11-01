import {
  type ProjectChange,
  type ProjectChangeImpact,
  projectChangeImpactSchema,
} from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  projectChanges,
  projects,
  quotations,
  users,
} from '@oneohm/database';
import type { ProjectChangeKind, ProjectChangeStatus } from '@oneohm/domain';
import { desc, eq, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const raiser = alias(users, 'raiser');
const approver = alias(users, 'approver');

/** Changes as people see them, newest first. */
export async function changeViews(db: DatabaseExecutor, where: SQL): Promise<ProjectChange[]> {
  const rows = await db
    .select({
      change: projectChanges,
      projectCode: projects.code,
      raisedBy: raiser.fullName,
      approvedBy: approver.fullName,
    })
    .from(projectChanges)
    .innerJoin(projects, eq(projects.id, projectChanges.projectId))
    .leftJoin(raiser, eq(raiser.id, projectChanges.raisedByUserId))
    .leftJoin(approver, eq(approver.id, projectChanges.approvedByUserId))
    .where(where)
    .orderBy(desc(projectChanges.number));
  const quoteIds = rows.flatMap((row) => (row.change.quotationId ? [row.change.quotationId] : []));
  const quotes = quoteIds.length
    ? await db
        .select({
          id: quotations.id,
          number: quotations.number,
          revision: quotations.revision,
          status: quotations.status,
        })
        .from(quotations)
        .where(inArray(quotations.id, quoteIds))
    : [];
  return rows.map(({ change, projectCode, raisedBy, approvedBy }) => ({
    id: change.id,
    projectId: change.projectId,
    projectCode,
    number: change.number,
    status: change.status as ProjectChangeStatus,
    kinds: change.kinds as ProjectChangeKind[],
    reason: change.reason,
    impact: impactOf(change.impact),
    quotation: quotes.find((quote) => quote.id === change.quotationId) ?? null,
    raisedBy,
    raisedAt: change.createdAt.toISOString(),
    approvedBy,
    approvedAt: change.approvedAt?.toISOString() ?? null,
    closedAt: change.closedAt?.toISOString() ?? null,
    closeReason: change.closeReason,
  }));
}

/** The impact as saved; read through the contract so old rows still show. */
function impactOf(raw: unknown): ProjectChangeImpact {
  return projectChangeImpactSchema.parse(raw);
}

export async function changeView(db: DatabaseExecutor, id: string): Promise<ProjectChange | null> {
  const [found] = await changeViews(db, eq(projectChanges.id, id));
  return found ?? null;
}
