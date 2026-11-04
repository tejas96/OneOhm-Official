import { auditLog, type DatabaseExecutor, leads, referralRewards } from '@oneohm/database';
import { and, asc, eq, gte, ne, sql } from 'drizzle-orm';

export interface Usage {
  campaignPaise: number;
  byCustomer: Map<string, { count: number; paise: number }>;
  /** Every project already rewarded, in any campaign: a project earns once. */
  projects: Set<string>;
}

export interface UsageRow {
  readonly customerId: string;
  readonly projectId: string;
  readonly amountPaise: number;
  /** The referral was registered on or after this campaign's start day. */
  readonly inCampaign: boolean;
}

/** The budget and per-customer limits count only this campaign's rewards. */
export function usageFrom(rows: readonly UsageRow[]): Usage {
  const usage: Usage = { campaignPaise: 0, byCustomer: new Map(), projects: new Set() };
  for (const row of rows) {
    usage.projects.add(row.projectId);
    if (row.inCampaign) record(usage, row.customerId, row.projectId, row.amountPaise);
  }
  return usage;
}

export function record(usage: Usage, customerId: string, projectId: string, amountPaise: number) {
  usage.campaignPaise += amountPaise;
  const mine = usage.byCustomer.get(customerId) ?? { count: 0, paise: 0 };
  usage.byCustomer.set(customerId, { count: mine.count + 1, paise: mine.paise + amountPaise });
  usage.projects.add(projectId);
}

/** Campaign start as a moment: midnight in India on the start day. */
export const campaignStart = (startsOn: string) => new Date(`${startsOn}T00:00:00+05:30`);

/** What the campaign has committed so far: every reward not turned down. */
export async function usageOf(db: DatabaseExecutor, startsOn: string): Promise<Usage> {
  const rows = await db
    .select({
      customerId: referralRewards.referrerCustomerId,
      projectId: referralRewards.projectId,
      amountPaise: referralRewards.amountPaise,
      inCampaign: sql<boolean>`${gte(leads.createdAt, campaignStart(startsOn))}`,
    })
    .from(referralRewards)
    // A left join: a reward whose lead is gone still keeps its project from earning twice.
    .leftJoin(leads, eq(leads.id, referralRewards.leadId))
    .where(ne(referralRewards.status, 'rejected'));
  return usageFrom(rows);
}

export interface OnPeriod {
  readonly from: Date;
  readonly to: Date | null;
}

/**
 * When the programme was switched on, from its saves (oldest first). With no saves on
 * record it counts as on all along when it is on now, and never when it is off.
 */
export function onPeriods(
  saves: readonly { readonly at: Date; readonly active: boolean }[],
  activeNow: boolean,
): OnPeriod[] {
  if (saves.length === 0) return activeNow ? [{ from: new Date(0), to: null }] : [];
  const periods: OnPeriod[] = [];
  let since: Date | null = null;
  for (const save of saves) {
    if (save.active && !since) since = save.at;
    if (!save.active && since) {
      periods.push({ from: since, to: save.at });
      since = null;
    }
  }
  if (since) periods.push({ from: since, to: null });
  return periods;
}

/** True when the programme was on at that moment. */
export const wasOnAt = (periods: readonly OnPeriod[], at: Date) =>
  periods.some((period) => period.from <= at && (period.to === null || at < period.to));

/** The programme's on-periods, read from its saves in the audit log. */
export async function programOnPeriods(
  db: DatabaseExecutor,
  activeNow: boolean,
): Promise<OnPeriod[]> {
  const rows = await db
    .select({ at: auditLog.createdAt, data: auditLog.data })
    .from(auditLog)
    .where(
      and(eq(auditLog.action, 'referral_program.saved'), eq(auditLog.entity, 'referral_program')),
    )
    .orderBy(asc(auditLog.createdAt));
  const saves = rows.map((row) => ({
    at: row.at,
    active: (row.data as { active?: unknown } | null)?.active === true,
  }));
  return onPeriods(saves, activeNow);
}
