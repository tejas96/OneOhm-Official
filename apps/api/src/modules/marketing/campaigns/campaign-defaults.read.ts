import type { CampaignDefaults } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leads,
  marketingCampaigns,
  messageTemplates,
  readBusinessSetting,
} from '@oneohm/database';
import { type CampaignChannel, DEFAULT_CHANNELS, MESSAGE_SEGMENTS } from '@oneohm/domain';
import { connectionsFor, segmentPeople } from '@oneohm/marketing';
import { addDays, todayIn } from '@oneohm/shared';
import { desc, gte, sql } from 'drizzle-orm';
import { practiceApprovedKeys, readPracticeTemplates } from '../connections/sandbox-templates';
import type { CampaignContext } from './campaign-context';
import { readyPlaces } from './campaign-defaults';

/** Lead cities of the last 180 days, most common first. */
async function topCities(db: DatabaseExecutor, today: string): Promise<string[]> {
  const rows = await db
    .select({ city: leads.city, total: sql<number>`count(*)::int` })
    .from(leads)
    .where(gte(leads.createdAt, new Date(`${addDays(today, -180)}T00:00:00+05:30`)))
    .groupBy(leads.city)
    .orderBy(desc(sql`count(*)`))
    .limit(8);
  return rows
    .map((row) => row.city)
    .filter((city) => city.trim() !== '' && city.trim().toLowerCase() !== 'not given');
}

/** What the New campaign screen starts with. */
export async function readDefaults(ctx: CampaignContext): Promise<CampaignDefaults> {
  const { db, env, config } = ctx;
  const today = todayIn();
  const settings = await readBusinessSetting(db, 'marketing');
  const [last] = await db
    .select({
      city: marketingCampaigns.city,
      budget: marketingCampaigns.dailyBudgetPaise,
      channels: marketingCampaigns.channels,
    })
    .from(marketingCampaigns)
    .orderBy(desc(marketingCampaigns.createdAt))
    .limit(1);
  const cities = await topCities(db, today);
  const connections = await connectionsFor(db, config.mode);
  const usable = (provider: 'meta' | 'google') => {
    const status = connections.find((row) => row.provider === provider)?.status;
    return status === 'connected' || status === 'in_review';
  };
  const metaDetails = (connections.find((row) => row.provider === 'meta')?.details ?? {}) as {
    instagramId?: string;
    pageId?: string;
  };
  const templates = await db
    .select({ key: messageTemplates.key, active: messageTemplates.active })
    .from(messageTemplates);
  const { ready, why } = readyPlaces({
    mode: config.mode,
    meta: {
      appKeys: config.meta !== null,
      usable: usable('meta'),
      instagramId: metaDetails.instagramId ?? null,
      pageId: metaDetails.pageId ?? null,
    },
    google: { appKeys: config.google !== null, usable: usable('google') },
    whatsappToken: Boolean(env.WHATSAPP_ACCESS_TOKEN),
    activeTemplates:
      config.mode === 'sandbox'
        ? practiceApprovedKeys(await readPracticeTemplates(db))
        : new Set(templates.filter((row) => row.active).map((row) => row.key)),
  });
  const segments = [];
  for (const segment of MESSAGE_SEGMENTS) {
    segments.push({ segment, count: (await segmentPeople(db, segment, today)).length });
  }
  return {
    mode: config.mode,
    goal: 'chats',
    channels: last?.channels.length ? (last.channels as CampaignChannel[]) : [...DEFAULT_CHANNELS],
    city: last?.city || settings.defaultCity || cities[0] || '',
    dailyBudgetPaise: last?.budget || settings.defaultDailyBudgetPaise,
    cities,
    segments,
    ready,
    why,
    defaultSegments: ['quoted_not_won', 'lost_revisit'],
  };
}
