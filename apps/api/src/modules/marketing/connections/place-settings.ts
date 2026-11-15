import {
  companyProfile,
  marketingJobs,
  readBusinessSetting,
  writeBusinessSetting,
} from '@oneohm/database';
import { checkMarketingSettings, type MarketingSettings } from '@oneohm/domain';
import { findPlace, type PlaceChoice, plainError } from '@oneohm/marketing';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../../common/audit';
import { invalid } from '../../../common/http/errors';
import type { FlowDeps } from './connect-flow-types';

/** The Google Maps key the server has, if any. */
export const mapsKey = (deps: FlowDeps): string | undefined =>
  deps.env.GOOGLE_MAPS_SERVER_KEY ?? deps.env.GOOGLE_MAPS_API_KEY;

/** The business name and short address from the company profile: what to look for first. */
export async function defaultPlaceQuery(deps: FlowDeps): Promise<string> {
  const [profile] = await deps.db
    .select({ brand: companyProfile.brandName, address: companyProfile.shortAddress })
    .from(companyProfile)
    .limit(1);
  return profile ? `${profile.brand} ${profile.address}`.trim() : '';
}

/** Businesses on Google Maps for the words; an empty `q` uses the company profile. */
export async function searchPlaces(deps: FlowDeps, q: string | undefined): Promise<PlaceChoice[]> {
  const key = mapsKey(deps);
  if (!key) throw invalid('Add a Google Maps key to find your business.');
  const query = q?.trim() || (await defaultPlaceQuery(deps));
  if (!query) throw invalid('Type your business name to look it up.');
  try {
    return await findPlace(key, query, deps.config.fetch);
  } catch (error) {
    throw invalid(plainError(error));
  }
}

/** The name and address of the chosen place, when a fresh look-up by the profile finds it. */
async function lookUp(deps: FlowDeps, placeId: string): Promise<PlaceChoice | null> {
  try {
    const found = await searchPlaces(deps, undefined);
    return found.find((place) => place.id === placeId) ?? null;
  } catch {
    return null;
  }
}

/** Keeps the place words beside the reviews job, without touching what else it keeps. */
async function savePlaceWords(deps: FlowDeps, place: PlaceChoice | null): Promise<void> {
  const [job] = await deps.db.select().from(marketingJobs).where(eq(marketingJobs.key, 'reviews'));
  const data = {
    ...((job?.data as Record<string, unknown> | null) ?? {}),
    placeName: place?.name ?? '',
    placeAddress: place?.address ?? '',
  };
  await deps.db
    .insert(marketingJobs)
    .values({ key: 'reviews', ranAt: new Date(0), data })
    .onConflictDoUpdate({ target: marketingJobs.key, set: { data, updatedAt: new Date() } });
}

/** Checks and saves the marketing defaults; a new Google place gets its name looked up. */
export async function saveMarketingSettings(
  deps: FlowDeps,
  userId: string,
  value: MarketingSettings,
): Promise<void> {
  const errors = checkMarketingSettings(value);
  if (Object.keys(errors).length > 0) throw invalid('Some settings need a fix.', errors);
  const before = await readBusinessSetting(deps.db, 'marketing');
  await writeBusinessSetting(deps.db, 'marketing', value, userId);
  await recordAudit(deps.db, userId, 'marketing.settings', 'business_setting', 'marketing');
  if (value.googlePlaceId === before.googlePlaceId) return;
  await savePlaceWords(deps, value.googlePlaceId ? await lookUp(deps, value.googlePlaceId) : null);
}
