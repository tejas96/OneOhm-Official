import type { CodeCard, MarketingOverview } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leadCampaigns,
  leads,
  marketingCampaigns,
  marketingJobs,
  marketingReviewRequests,
  marketingReviews,
  referralPrograms,
  referralRewards,
} from '@oneohm/database';
import { and, count, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';

/** Old poster and flyer codes (no marketing campaign behind them) with their leads and sales. */
export async function readCodeCards(db: DatabaseExecutor): Promise<CodeCard[]> {
  const codes = await db
    .select()
    .from(leadCampaigns)
    .where(
      notInArray(
        leadCampaigns.code,
        db.select({ code: marketingCampaigns.code }).from(marketingCampaigns),
      ),
    )
    .orderBy(desc(leadCampaigns.createdAt));
  if (codes.length === 0) return [];
  const counted = await db
    .select({
      code: leads.campaignCode,
      total: sql<number>`count(*)::int`,
      won: sql<number>`count(${leads.wonAt})::int`,
    })
    .from(leads)
    .where(
      inArray(
        leads.campaignCode,
        codes.map((row) => row.code),
      ),
    )
    .groupBy(leads.campaignCode);
  return codes.map((row) => {
    const own = counted.find((item) => item.code === row.code);
    return {
      code: row.code,
      name: row.name,
      active: row.active,
      leads: own?.total ?? 0,
      sales: own?.won ?? 0,
    };
  });
}

/** The refer-and-earn card; null until the owner has saved a programme. */
export async function readReferralCard(
  db: DatabaseExecutor,
): Promise<MarketingOverview['referral']> {
  const [program] = await db.select().from(referralPrograms).limit(1);
  if (!program) return null;
  const [referred] = await db
    .select({ total: sql<number>`count(*)::int`, won: sql<number>`count(${leads.wonAt})::int` })
    .from(leads)
    .where(eq(leads.source, 'referral'));
  const [paid] = await db
    .select({ paise: sql<string>`coalesce(sum(${referralRewards.amountPaise}), 0)` })
    .from(referralRewards)
    .where(eq(referralRewards.status, 'paid'));
  return {
    active: program.active,
    leads: referred?.total ?? 0,
    sales: referred?.won ?? 0,
    rewardsPaise: Number(paid?.paise ?? 0),
  };
}

/** Google reviews: the latest five, the rating and total the worker read, and who was asked. */
export async function readReviews(db: DatabaseExecutor): Promise<MarketingOverview['reviews']> {
  const latest = await db
    .select()
    .from(marketingReviews)
    .orderBy(desc(sql`coalesce(${marketingReviews.publishedAt}, ${marketingReviews.createdAt})`))
    .limit(5);
  const [fresh] = await db
    .select({ total: count() })
    .from(marketingReviews)
    .where(isNull(marketingReviews.seenAt));
  const [asked] = await db
    .select({ total: count() })
    .from(marketingReviewRequests)
    .where(eq(marketingReviewRequests.status, 'asked'));
  const [job] = await db
    .select({ data: marketingJobs.data })
    .from(marketingJobs)
    .where(eq(marketingJobs.key, 'reviews'));
  const data = (job?.data ?? {}) as { rating?: unknown; total?: unknown };
  return {
    rating: typeof data.rating === 'number' ? data.rating : null,
    total: typeof data.total === 'number' ? data.total : 0,
    newCount: fresh?.total ?? 0,
    asked: asked?.total ?? 0,
    latest: latest.map((row) => ({
      id: row.id,
      author: row.author,
      rating: row.rating,
      text: row.text,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      isNew: row.seenAt === null,
    })),
  };
}

/** Marks every unseen review as seen. */
export async function markReviewsSeen(db: DatabaseExecutor): Promise<void> {
  await db
    .update(marketingReviews)
    .set({ seenAt: new Date() })
    .where(and(isNull(marketingReviews.seenAt), isNotNull(marketingReviews.id)));
}
