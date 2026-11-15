import { type CampaignNumbers } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leads,
  marketingMessages,
  marketingSpendDays,
  outbox,
  quotations,
} from '@oneohm/database';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { NO_NUMBERS, numbersOf, type RawNumbers, wonValueByLead } from './campaign-numbers';

export interface CampaignKey {
  readonly id: string;
  readonly code: string;
}

/** Won leads of these codes with the value of their accepted quotations. */
async function salesByCode(db: DatabaseExecutor, codes: readonly string[]) {
  const won = await db
    .select({ id: leads.id, code: leads.campaignCode })
    .from(leads)
    .where(and(inArray(leads.campaignCode, [...codes]), isNotNull(leads.wonAt)));
  const accepted =
    won.length === 0
      ? []
      : await db
          .select({
            leadId: quotations.leadId,
            number: quotations.number,
            revision: quotations.revision,
            totalPaise: quotations.totalPaise,
          })
          .from(quotations)
          .where(
            and(
              inArray(
                quotations.leadId,
                won.map((row) => row.id),
              ),
              eq(quotations.status, 'accepted'),
            ),
          );
  const value = wonValueByLead(accepted);
  const byCode = new Map<string, { sales: number; valuePaise: number }>();
  for (const lead of won) {
    if (!lead.code) continue;
    const row = byCode.get(lead.code) ?? { sales: 0, valuePaise: 0 };
    row.sales += 1;
    row.valuePaise += value.get(lead.id) ?? 0;
    byCode.set(lead.code, row);
  }
  return byCode;
}

/** The numbers of each campaign: spend, leads, sales and their value, messages sent and read. */
export async function readCampaignNumbers(
  db: DatabaseExecutor,
  campaigns: readonly CampaignKey[],
): Promise<Map<string, CampaignNumbers>> {
  const result = new Map<string, CampaignNumbers>();
  if (campaigns.length === 0) return result;
  const ids = campaigns.map((campaign) => campaign.id);
  const codes = campaigns.map((campaign) => campaign.code);
  const spend = await db
    .select({
      id: marketingSpendDays.campaignId,
      paise: sql<string>`coalesce(sum(${marketingSpendDays.spendPaise}), 0)`,
    })
    .from(marketingSpendDays)
    .where(inArray(marketingSpendDays.campaignId, ids))
    .groupBy(marketingSpendDays.campaignId);
  const counted = await db
    .select({ code: leads.campaignCode, total: sql<number>`count(*)::int` })
    .from(leads)
    .where(inArray(leads.campaignCode, codes))
    .groupBy(leads.campaignCode);
  const messages = await db
    .select({
      id: marketingMessages.campaignId,
      sent: sql<number>`count(*) filter (where ${outbox.status} = 'sent')::int`,
      read: sql<number>`count(*) filter (where ${outbox.deliveryStatus} = 'read')::int`,
    })
    .from(marketingMessages)
    .innerJoin(outbox, eq(outbox.id, marketingMessages.outboxId))
    .where(inArray(marketingMessages.campaignId, ids))
    .groupBy(marketingMessages.campaignId);
  const sales = await salesByCode(db, codes);
  for (const campaign of campaigns) {
    const raw: RawNumbers = {
      ...NO_NUMBERS,
      spentPaise: Number(spend.find((row) => row.id === campaign.id)?.paise ?? 0),
      leads: counted.find((row) => row.code === campaign.code)?.total ?? 0,
      sales: sales.get(campaign.code)?.sales ?? 0,
      salesValuePaise: sales.get(campaign.code)?.valuePaise ?? 0,
      messagesSent: messages.find((row) => row.id === campaign.id)?.sent ?? 0,
      messagesRead: messages.find((row) => row.id === campaign.id)?.read ?? 0,
    };
    result.set(campaign.id, numbersOf(raw));
  }
  return result;
}
