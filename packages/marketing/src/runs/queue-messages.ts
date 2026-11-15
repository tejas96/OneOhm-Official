import {
  type DatabaseExecutor,
  marketingCampaigns,
  marketingMedia,
  marketingMessages,
  outbox,
} from '@oneohm/database';
import {
  MESSAGE_SEGMENTS,
  type MessageSegment,
  SEGMENT_TEMPLATE,
  templateFieldText,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { mediaPublicUrl, type RunContext, type SegmentPerson, todayInIndia } from './run-types';
import { onePerPhone, segmentPeople } from './segments';

/** What the offer templates fill in: the person's first name, the business, the text, a photo. */
export interface OfferPayload {
  readonly customer: string;
  readonly company: string;
  readonly message: string;
  readonly imageUrl?: string;
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || 'there';

export function offerPayload(
  person: SegmentPerson,
  text: string,
  context: RunContext,
  imageUrl: string | null,
): OfferPayload {
  return {
    customer: firstNameOf(person.name),
    company: context.businessName,
    message: templateFieldText(text),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/** A person with the segment that picked them. */
export interface PickedPerson {
  readonly segment: MessageSegment;
  readonly person: SegmentPerson;
}

/** Everyone across the segments, a phone only once (the first segment keeps it). */
export function pickPeople(
  lists: readonly { readonly segment: MessageSegment; readonly people: readonly SegmentPerson[] }[],
): PickedPerson[] {
  const picked: PickedPerson[] = [];
  const seen = new Set<string>();
  for (const { segment, people } of lists) {
    for (const person of onePerPhone(people)) {
      if (seen.has(person.phoneE164)) continue;
      seen.add(person.phoneE164);
      picked.push({ segment, person });
    }
  }
  return picked;
}

/** Plain words kept on the WhatsApp place when nobody was in the chosen lists. */
export const NOBODY_WORDS = 'Nobody in these lists right now.';

/**
 * The WhatsApp place after a send: sent to N people, or sent to nobody. Nobody is a neutral note,
 * not a failure: it must not make a campaign whose ads went live look broken.
 */
export function whatsappResult(count: number) {
  return {
    state: 'sent' as const,
    notes: [count > 0 ? `Sent to ${count} people` : NOBODY_WORDS],
    lastError: null,
  };
}

const BATCH = 400;

/**
 * Queues the campaign's WhatsApp message to everyone in its segments (once per number; STOP and
 * unreachable numbers left out). A number already queued for this campaign is skipped, so a
 * second run never doubles. Returns how many were queued now.
 */
export async function queueCampaignMessages(
  db: DatabaseExecutor,
  campaignId: string,
  context: RunContext,
): Promise<number> {
  const [campaign] = await db
    .select({
      text: marketingCampaigns.text,
      segments: marketingCampaigns.segments,
      mediaId: marketingCampaigns.mediaId,
      mediaKind: marketingMedia.kind,
    })
    .from(marketingCampaigns)
    .leftJoin(marketingMedia, eq(marketingMedia.id, marketingCampaigns.mediaId))
    .where(eq(marketingCampaigns.id, campaignId));
  if (!campaign) throw new Error('Campaign not found.');
  const today = todayInIndia();
  const segments = MESSAGE_SEGMENTS.filter((segment) => campaign.segments.includes(segment));
  const lists: Parameters<typeof pickPeople>[0][number][] = [];
  for (const segment of segments)
    lists.push({ segment, people: await segmentPeople(db, segment, today) });
  const imageUrl =
    campaign.mediaId && campaign.mediaKind === 'image'
      ? mediaPublicUrl(context.apiPublicUrl, campaign.mediaId)
      : null;
  const existing = await db
    .select({ phone: marketingMessages.phoneE164 })
    .from(marketingMessages)
    .where(eq(marketingMessages.campaignId, campaignId));
  const done = new Set(existing.map((row) => row.phone));
  const fresh = pickPeople(lists).filter(({ person }) => !done.has(person.phoneE164));
  let queued = 0;
  for (let at = 0; at < fresh.length; at += BATCH) {
    queued += await queueBatch(
      db,
      campaignId,
      fresh.slice(at, at + BATCH),
      campaign.text,
      context,
      imageUrl,
    );
  }
  return queued;
}

async function queueBatch(
  db: DatabaseExecutor,
  campaignId: string,
  batch: readonly PickedPerson[],
  text: string,
  context: RunContext,
  imageUrl: string | null,
): Promise<number> {
  return db.transaction(async (tx) => {
    const sent = await tx
      .insert(outbox)
      .values(
        batch.map(({ segment, person }) => ({
          channel: 'whatsapp' as const,
          recipient: person.phoneE164,
          template: SEGMENT_TEMPLATE[segment],
          payload: offerPayload(person, text, context, imageUrl),
          dedupeKey: `mkt:${campaignId}:${person.phoneE164}`,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: outbox.id, recipient: outbox.recipient });
    const outboxOf = new Map(sent.map((row) => [row.recipient, row.id]));
    const rows = batch
      .filter(({ person }) => outboxOf.has(person.phoneE164))
      .map(({ segment, person }) => ({
        campaignId,
        phoneE164: person.phoneE164,
        segment,
        leadId: person.leadId,
        customerId: person.customerId,
        outboxId: outboxOf.get(person.phoneE164) ?? null,
      }));
    if (rows.length === 0) return 0;
    const inserted = await tx
      .insert(marketingMessages)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: marketingMessages.id });
    return inserted.length;
  });
}
