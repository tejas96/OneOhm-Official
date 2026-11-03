import type { LeadDetail, LeadQuotation } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leadActivities,
  leadCampaigns,
  leads,
  quotations,
  users,
} from '@oneohm/database';
import { and, desc, eq, inArray, isNull, lte, ne, notInArray, or, type SQL } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { quotationScope } from '../quotations/quotation-access';
import { presentLeads } from './lead-present';

/** Staff with `leads.view_all` see every lead; others see the leads they own or brought. */
export function leadVisibility(actor: Actor): SQL {
  if (can(actor, 'leads.view_all')) return eq(leads.id, leads.id);
  if (!can(actor, 'leads.view_own') && !can(actor, 'leads.manage')) throw forbidden();
  return (
    or(eq(leads.ownerUserId, actor.userId), eq(leads.resellerUserId, actor.userId)) ??
    eq(leads.ownerUserId, actor.userId)
  );
}

/**
 * Resellers never see staff-only entries (PRD 4.8): they see their own entries, stage
 * moves and follow-ups, and what staff chose to share.
 */
function activityScope(actor: Actor, leadId: string): SQL | undefined {
  const lead = eq(leadActivities.leadId, leadId);
  if (actor.kind !== 'reseller') return lead;
  return and(lead, or(eq(leadActivities.internal, false), eq(leadActivities.userId, actor.userId)));
}

/** Open leads, and lost leads whose revisit day has come (the owner's follow-ups). */
export function needsFollowUp(today: string): SQL {
  const open = notInArray(leads.stage, ['won', 'lost']);
  return or(open, and(eq(leads.stage, 'lost'), lte(leads.revisitOn, today))) ?? open;
}

/** Open leads with no owner, or an owner who has left (status inactive). */
export function unownedLeads(db: DatabaseExecutor): SQL {
  const gone = db.select({ id: users.id }).from(users).where(ne(users.status, 'active'));
  const open = notInArray(leads.stage, ['won', 'lost']);
  return and(open, or(isNull(leads.ownerUserId), inArray(leads.ownerUserId, gone))) ?? open;
}

/** One lead with its history and the quotations made for it, as the actor may see them. */
export async function readLeadDetail(
  db: DatabaseExecutor,
  actor: Actor,
  id: string,
): Promise<LeadDetail> {
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), leadVisibility(actor)))
    .limit(1);
  if (!row) throw notFound('That lead');
  const [lead] = await presentLeads(db, [row], can(actor, 'customers.view'));
  if (!lead) throw notFound('That lead');
  const activityRows = await db
    .select({ activity: leadActivities, userName: users.fullName })
    .from(leadActivities)
    .leftJoin(users, eq(users.id, leadActivities.userId))
    .where(activityScope(actor, id))
    .orderBy(desc(leadActivities.createdAt));
  return {
    ...lead,
    attribution: await attributionOf(db, row),
    activities: activityRows.map(({ activity, userName }) => ({
      id: activity.id,
      kind: activity.kind,
      note: activity.note,
      user: activity.userId && userName ? { id: activity.userId, fullName: userName } : null,
      internal: activity.internal,
      createdAt: activity.createdAt.toISOString(),
    })),
    quotations: await leadQuotations(db, actor, id),
    fromReseller: row.resellerUserId !== null,
  };
}

/** Quotations saved for the lead, newest first, within what the actor may see. */
async function leadQuotations(
  db: DatabaseExecutor,
  actor: Actor,
  leadId: string,
): Promise<LeadQuotation[]> {
  const rows = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.leadId, leadId), quotationScope(actor)))
    .orderBy(desc(quotations.createdAt));
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    revision: row.revision,
    status: row.status,
    capacityWp: row.capacityWp,
    effectivePaise: row.effectivePaise,
    discountPendingApproval:
      row.discountPaise > 0 &&
      row.discountApprovedByUserId === null &&
      (row.snapshot as { discountNeedsApproval?: boolean } | null)?.discountNeedsApproval === true,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The lead's first-touch attribution, with the campaign's name when its code is listed. */
async function attributionOf(
  db: DatabaseExecutor,
  row: typeof leads.$inferSelect,
): Promise<LeadDetail['attribution']> {
  const [campaign] = row.campaignCode
    ? await db
        .select({ name: leadCampaigns.name })
        .from(leadCampaigns)
        .where(eq(leadCampaigns.code, row.campaignCode))
        .limit(1)
    : [];
  return {
    campaignCode: row.campaignCode,
    campaignName: campaign?.name ?? null,
    adId: row.adId,
    adHeadline: row.adHeadline,
    adSourceUrl: row.adSourceUrl,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    landingPage: row.landingPage,
  };
}
