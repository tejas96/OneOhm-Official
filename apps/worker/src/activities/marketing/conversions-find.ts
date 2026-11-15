import { type Database, leads, marketingCampaigns, marketingConversions } from '@oneohm/database';
import { and, gte, isNotNull, or, sql } from 'drizzle-orm';
import { type AdLeadFacts, conversionsFor } from './conversion-facts';
import { advances, metaCampaignCodes, quotesOf, surveyTimes } from './conversion-lookups';

const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 90;

/**
 * Ad leads from the last 90 days and the sale steps they reached, noted once per lead, step and
 * platform (a step already noted stays as it is). Returns how many were noted now.
 */
export async function findConversions(db: Database, now: Date, timeZone: string): Promise<number> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  const candidates = await db
    .select()
    .from(leads)
    .where(
      and(
        gte(leads.createdAt, since),
        or(
          isNotNull(leads.ctwaClid),
          isNotNull(leads.gclid),
          isNotNull(leads.fbclid),
          isNotNull(leads.platformLeadId),
          sql`${leads.campaignCode} in (select ${marketingCampaigns.code} from ${marketingCampaigns})`,
        ),
      ),
    );
  if (candidates.length === 0) return 0;
  const ids = candidates.map((lead) => lead.id);
  const codes = [
    ...new Set(candidates.flatMap((lead) => (lead.campaignCode ? [lead.campaignCode] : []))),
  ];

  const onMeta = await metaCampaignCodes(db, codes);
  const surveys = await surveyTimes(db, ids, timeZone);
  const quotes = await quotesOf(db, ids);
  const paid = await advances(db, ids, timeZone);

  const values: (typeof marketingConversions.$inferInsert)[] = [];
  for (const lead of candidates) {
    const mine = quotes.filter((quote) => quote.leadId === lead.id);
    const sent = mine.filter((quote) => quote.sentAt !== null);
    const accepted =
      mine.find((quote) => quote.status === 'accepted') ?? mine.find((q) => q.projectId);
    const surveyAt = surveys.get(lead.id) ?? null;
    const advance = paid.get(lead.id);
    const facts: AdLeadFacts = {
      stage: lead.stage,
      ctwaClid: lead.ctwaClid,
      fbclid: lead.fbclid,
      gclid: lead.gclid,
      platformLeadId: lead.platformLeadId,
      campaignOnMeta: Boolean(lead.campaignCode && onMeta.has(lead.campaignCode)),
      surveyBooked: surveyAt !== null,
      surveyAt,
      quoteSentAt: sent.at(-1)?.sentAt ?? null,
      // The latest sent quotation's total; else the accepted one's.
      quotedPaise: (sent[0] ?? accepted)?.totalPaise ?? null,
      advance: advance ?? null,
      wonAt: lead.wonAt,
      wonPaise: accepted?.totalPaise ?? null,
      leadCreatedAt: lead.createdAt,
      leadUpdatedAt: lead.updatedAt,
    };
    for (const found of conversionsFor(facts, now)) values.push({ leadId: lead.id, ...found });
  }
  let noted = 0;
  for (let at = 0; at < values.length; at += 500) {
    const rows = await db
      .insert(marketingConversions)
      .values(values.slice(at, at + 500))
      .onConflictDoNothing()
      .returning({ id: marketingConversions.id });
    noted += rows.length;
  }
  return noted;
}
