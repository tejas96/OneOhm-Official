import { randomBytes } from 'node:crypto';
import {
  companyProfile,
  type DatabaseExecutor,
  marketingCampaigns,
  marketingClicks,
  marketingMedia,
} from '@oneohm/database';
import { eq } from 'drizzle-orm';

export interface LandingCampaign {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly text: string;
  readonly city: string;
  readonly media: { readonly id: string; readonly kind: 'image' | 'video' } | null;
}

const CODE = /^[A-Z0-9-]{2,20}$/;

/** The campaign behind a code while its offer is on; null when unknown, stopped or a post. */
export async function openCampaign(
  db: DatabaseExecutor,
  rawCode: string,
): Promise<LandingCampaign | null> {
  const code = rawCode.toUpperCase();
  if (!CODE.test(code)) return null;
  const [row] = await db
    .select({
      id: marketingCampaigns.id,
      code: marketingCampaigns.code,
      name: marketingCampaigns.name,
      text: marketingCampaigns.text,
      city: marketingCampaigns.city,
      state: marketingCampaigns.state,
      goal: marketingCampaigns.goal,
      mediaId: marketingMedia.id,
      mediaKind: marketingMedia.kind,
    })
    .from(marketingCampaigns)
    .leftJoin(marketingMedia, eq(marketingMedia.id, marketingCampaigns.mediaId))
    .where(eq(marketingCampaigns.code, code));
  if (!row || row.goal === 'post' || row.state === 'stopped' || row.state === 'failed') return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    text: row.text,
    city: row.city,
    media: row.mediaId && row.mediaKind ? { id: row.mediaId, kind: row.mediaKind } : null,
  };
}

/** The business as the company profile names it. */
export async function companyInfo(db: DatabaseExecutor) {
  const [row] = await db
    .select({
      brandName: companyProfile.brandName,
      legalName: companyProfile.legalName,
      address: companyProfile.fullAddress,
      email: companyProfile.email,
      phones: companyProfile.phones,
    })
    .from(companyProfile)
    .limit(1);
  return {
    brand: row?.brandName ?? 'OneOhm',
    legalName: row?.legalName ?? row?.brandName ?? 'OneOhm',
    address: row?.address ?? '',
    email: row?.email ?? '',
    phone: row?.phones[0] ?? null,
  };
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Six random lower-case letters and digits: short enough to type, hard to guess. */
export function randomRef(): string {
  return Array.from(randomBytes(6), (byte) => LETTERS[byte % LETTERS.length]).join('');
}

/** One query value from a link: text up to 255 characters, or null. */
export function queryText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 255) : null;
}

/** Saves this visit with its ad click ids and returns its ref; null if it could not be saved. */
export async function recordClick(
  db: DatabaseExecutor,
  campaignId: string,
  query: Readonly<Record<string, unknown>>,
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ref = randomRef();
    try {
      const inserted = await db
        .insert(marketingClicks)
        .values({
          ref,
          campaignId,
          gclid: queryText(query.gclid),
          fbclid: queryText(query.fbclid),
          utmSource: queryText(query.utm_source),
          utmMedium: queryText(query.utm_medium),
          utmCampaign: queryText(query.utm_campaign),
        })
        .onConflictDoNothing()
        .returning({ ref: marketingClicks.ref });
      if (inserted.length > 0) return ref;
    } catch {
      return null;
    }
  }
  return null;
}
