import type { CampaignCard } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  marketingCampaigns,
  marketingMedia,
  marketingPlacements,
} from '@oneohm/database';
import { desc, eq, inArray, type SQL } from 'drizzle-orm';
import { notFound } from '../../../common/http/errors';
import { type CampaignRow, type MediaRow, type PlacementRow, toCard } from './campaign-card';
import { readCampaignNumbers } from './campaign-numbers.read';

/** Campaign cards, newest first. */
export async function readCards(
  db: DatabaseExecutor,
  options: { where?: SQL | undefined; limit?: number } = {},
): Promise<{ cards: CampaignCard[]; rows: CampaignRow[] }> {
  const rows = await db
    .select()
    .from(marketingCampaigns)
    .where(options.where)
    .orderBy(desc(marketingCampaigns.createdAt))
    .limit(options.limit ?? 200);
  if (rows.length === 0) return { cards: [], rows };
  const ids = rows.map((row) => row.id);
  const placements = await db
    .select()
    .from(marketingPlacements)
    .where(inArray(marketingPlacements.campaignId, ids));
  const mediaIds = rows.flatMap((row) => (row.mediaId ? [row.mediaId] : []));
  const media =
    mediaIds.length === 0
      ? []
      : await db.select().from(marketingMedia).where(inArray(marketingMedia.id, mediaIds));
  const numbers = await readCampaignNumbers(db, rows);
  const mediaById = new Map<string, MediaRow>(media.map((row) => [row.id, row]));
  const placementsOf = (id: string): PlacementRow[] =>
    placements.filter((placement) => placement.campaignId === id);
  const cards = rows.map((row) => {
    const own = numbers.get(row.id);
    if (!own) throw new Error('Campaign numbers are missing.');
    return toCard(
      row,
      placementsOf(row.id),
      row.mediaId ? (mediaById.get(row.mediaId) ?? null) : null,
      own,
    );
  });
  return { cards, rows };
}

/** One campaign's card, or 404. */
export async function readCard(db: DatabaseExecutor, id: string) {
  const { cards, rows } = await readCards(db, { where: eq(marketingCampaigns.id, id), limit: 1 });
  const card = cards[0];
  const row = rows[0];
  if (!card || !row) throw notFound('That campaign');
  return { card, row };
}
