import { type DatabaseExecutor, leads, projects, quotations, users } from '@oneohm/database';
import type { ProjectType } from '@oneohm/domain';
import { and, eq, gte, inArray, lt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ReportScope } from './report-scope';

/** Leads and quotations carry the subsidy category, which maps one to one to the project type. */
const leadOwner = alias(users, 'lead_owner');

const CATEGORY_OF: Readonly<Record<ProjectType, 'individual' | 'society' | 'commercial'>> = {
  residential: 'individual',
  society: 'society',
  commercial: 'commercial',
};

export interface LeadFact {
  readonly id: string;
  readonly source: (typeof leads.source.enumValues)[number];
  readonly stage: string;
  readonly ownerUserId: string | null;
  readonly owner: string | null;
  readonly lostReason: string | null;
  readonly createdAt: Date;
  readonly wonAt: Date | null;
}

/** One quotation chain (all revisions share the number): when it went out, won or was lost. */
export interface OrderFact {
  readonly number: string;
  readonly leadId: string | null;
  readonly ownerUserId: string | null;
  readonly owner: string | null;
  readonly sentAt: Date | null;
  readonly acceptedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly totalPaise: number;
  readonly capacityWp: number;
  readonly hasProject: boolean;
}

/** Leads created in the range, of the chosen type. */
export async function readLeads(db: DatabaseExecutor, scope: ReportScope): Promise<LeadFact[]> {
  return db
    .select({
      id: leads.id,
      source: leads.source,
      stage: leads.stage,
      ownerUserId: leads.ownerUserId,
      owner: users.fullName,
      lostReason: leads.lostReason,
      createdAt: leads.createdAt,
      wonAt: leads.wonAt,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.ownerUserId))
    .where(
      and(
        gte(leads.createdAt, scope.from),
        lt(leads.createdAt, scope.until),
        scope.projectType ? eq(leads.subsidyCategory, CATEGORY_OF[scope.projectType]) : undefined,
      ),
    );
}

/**
 * Quotation chains touched by the range or by the range's leads. A revision is the same
 * order, so a chain counts once: sent on its first send, won on its first acceptance,
 * valued at its current (latest accepted, else latest) revision.
 */
export async function readOrders(
  db: DatabaseExecutor,
  scope: ReportScope,
  leadIds: readonly string[],
): Promise<OrderFact[]> {
  const inRange = (column: typeof quotations.sentAt) =>
    and(gte(column, scope.from), lt(column, scope.until));
  const touched = await db
    .selectDistinct({ number: quotations.number })
    .from(quotations)
    .where(
      and(
        or(
          inRange(quotations.sentAt),
          inRange(quotations.acceptedAt),
          inRange(quotations.rejectedAt),
          leadIds.length > 0 ? inArray(quotations.leadId, [...leadIds]) : undefined,
        ),
        scope.projectType
          ? eq(quotations.subsidyCategory, CATEGORY_OF[scope.projectType])
          : undefined,
      ),
    );
  if (touched.length === 0) return [];
  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      revision: quotations.revision,
      status: quotations.status,
      leadId: quotations.leadId,
      createdBy: quotations.createdByUserId,
      creator: users.fullName,
      leadOwner: leads.ownerUserId,
      leadOwnerName: leadOwner.fullName,
      sentAt: quotations.sentAt,
      acceptedAt: quotations.acceptedAt,
      rejectedAt: quotations.rejectedAt,
      totalPaise: quotations.totalPaise,
      capacityWp: quotations.capacityWp,
      project: projects.id,
    })
    .from(quotations)
    .leftJoin(users, eq(users.id, quotations.createdByUserId))
    .leftJoin(leads, eq(leads.id, quotations.leadId))
    .leftJoin(leadOwner, eq(leadOwner.id, leads.ownerUserId))
    .leftJoin(projects, eq(projects.quotationId, quotations.id))
    .where(
      inArray(
        quotations.number,
        touched.map((row) => row.number),
      ),
    );
  return chains(rows);
}

type QuoteRow = {
  readonly number: string;
  readonly revision: number;
  readonly status: string;
  readonly leadId: string | null;
  readonly createdBy: string | null;
  readonly creator: string | null;
  readonly leadOwner: string | null;
  readonly leadOwnerName: string | null;
  readonly sentAt: Date | null;
  readonly acceptedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly totalPaise: number;
  readonly capacityWp: number;
  readonly project: string | null;
};

const earliest = (dates: readonly (Date | null)[]) =>
  dates.reduce<Date | null>(
    (first, date) => (date && (!first || date < first) ? date : first),
    null,
  );

function chains(rows: readonly QuoteRow[]): OrderFact[] {
  const byNumber = new Map<string, QuoteRow[]>();
  for (const row of rows) byNumber.set(row.number, [...(byNumber.get(row.number) ?? []), row]);
  return [...byNumber.entries()].map(([number, revisions]) => {
    const ordered = [...revisions].sort((a, b) => b.revision - a.revision);
    const current = ordered.find((row) => row.status === 'accepted') ?? ordered[0];
    const latest = ordered[0];
    const first = ordered.at(-1);
    return {
      number,
      leadId: first?.leadId ?? null,
      // The salesperson is the lead's owner; a walk-in quotation belongs to whoever made it.
      ownerUserId: first?.leadOwner ?? first?.createdBy ?? null,
      owner: first?.leadOwner ? first.leadOwnerName : (first?.creator ?? null),
      sentAt: earliest(revisions.map((row) => row.sentAt)),
      acceptedAt: earliest(revisions.map((row) => row.acceptedAt)),
      rejectedAt: latest?.status === 'rejected' ? latest.rejectedAt : null,
      totalPaise: current?.totalPaise ?? 0,
      capacityWp: current?.capacityWp ?? 0,
      hasProject: revisions.some((row) => row.project !== null),
    };
  });
}
