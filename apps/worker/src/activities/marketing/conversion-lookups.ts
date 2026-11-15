import {
  type Database,
  marketingCampaigns,
  marketingPlacements,
  paymentMilestones,
  payments,
  projects,
  quotations,
  visits,
} from '@oneohm/database';
import { and, desc, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { atBusinessTime } from './zoned';

export interface Advance {
  readonly paidAt: Date;
  readonly amountPaise: number;
}

export interface QuoteRow {
  readonly leadId: string | null;
  readonly sentAt: Date | null;
  readonly totalPaise: number;
  readonly status: string;
  readonly projectId: string | null;
}

/** Placement states that mean the campaign really ran (or runs) on the platform. */
const PLACED = ['in_review', 'live', 'paused', 'stopped'] as const;

/**
 * Codes of campaigns that run on Meta: a goal other than a plain post, with a Meta placement that
 * went past the start. A post-only campaign makes no leads, and a failed one never ran.
 */
export async function metaCampaignCodes(
  db: Database,
  codes: readonly string[],
): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const rows = await db
    .select({ code: marketingCampaigns.code })
    .from(marketingCampaigns)
    .innerJoin(marketingPlacements, eq(marketingPlacements.campaignId, marketingCampaigns.id))
    .where(
      and(
        inArray(marketingCampaigns.code, [...codes]),
        ne(marketingCampaigns.goal, 'post'),
        eq(marketingPlacements.provider, 'meta'),
        inArray(marketingPlacements.state, [...PLACED]),
      ),
    );
  return new Set(rows.map((row) => row.code));
}

/** The earliest booked survey visit per lead, as the moment on the business clock. */
export async function surveyTimes(
  db: Database,
  ids: readonly string[],
  timeZone: string,
): Promise<Map<string, Date>> {
  const found = new Map<string, Date>();
  const rows = await db
    .select({ leadId: visits.leadId, day: visits.day, startMin: visits.startMin })
    .from(visits)
    .where(
      and(
        inArray(visits.leadId, [...ids]),
        eq(visits.kind, 'survey'),
        ne(visits.status, 'cancelled'),
      ),
    )
    .orderBy(visits.day);
  for (const visit of rows)
    if (visit.leadId && !found.has(visit.leadId))
      found.set(visit.leadId, atBusinessTime(visit.day, visit.startMin, timeZone));
  return found;
}

/**
 * Sent quotations, newest first, and any accepted one or one a project was made from (an accepted
 * quotation may have no sent time).
 */
export async function quotesOf(db: Database, ids: readonly string[]): Promise<QuoteRow[]> {
  return db
    .select({
      leadId: quotations.leadId,
      sentAt: quotations.sentAt,
      totalPaise: quotations.totalPaise,
      status: quotations.status,
      projectId: projects.id,
    })
    .from(quotations)
    .leftJoin(projects, eq(projects.quotationId, quotations.id))
    .where(
      and(
        inArray(quotations.leadId, [...ids]),
        or(isNotNull(quotations.sentAt), eq(quotations.status, 'accepted'), isNotNull(projects.id)),
      ),
    )
    .orderBy(sql`${quotations.sentAt} desc nulls last`, desc(quotations.createdAt));
}

/**
 * The paid advance per lead: the first customer milestone of its project, once paid. When it was
 * paid and how much come from the real payment records (net of reversals), not the plan.
 */
export async function advances(
  db: Database,
  ids: readonly string[],
  timeZone: string,
): Promise<Map<string, Advance>> {
  const milestones = await db
    .select({ leadId: quotations.leadId, milestoneId: paymentMilestones.id })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(
      and(
        inArray(quotations.leadId, [...ids]),
        eq(paymentMilestones.payer, 'customer'),
        eq(paymentMilestones.status, 'paid'),
        sql`${paymentMilestones.position} = (
          select min(first.position) from payment_milestones first
           where first.project_id = ${paymentMilestones.projectId} and first.payer = 'customer'
        )`,
      ),
    );
  if (milestones.length === 0) return new Map();
  const received = await db
    .select({
      milestoneId: payments.milestoneId,
      amountPaise: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint`.mapWith(Number),
      receivedOn: sql<string>`max(${payments.receivedOn}) filter (where ${payments.reversesPaymentId} is null)`,
    })
    .from(payments)
    .where(
      inArray(
        payments.milestoneId,
        milestones.map((row) => row.milestoneId),
      ),
    )
    .groupBy(payments.milestoneId);
  const byMilestone = new Map(received.map((row) => [row.milestoneId, row]));
  const result = new Map<string, Advance>();
  for (const { leadId, milestoneId } of milestones) {
    const money = byMilestone.get(milestoneId);
    if (!leadId || !money?.receivedOn) continue;
    result.set(leadId, {
      paidAt: atBusinessTime(money.receivedOn, null, timeZone),
      amountPaise: money.amountPaise,
    });
  }
  return result;
}
