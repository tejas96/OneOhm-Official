import { PlatformError } from '../errors';
import type { Fetch } from '../types';
import type { GoogleJson } from './google-errors';

export interface PlaceChoice {
  readonly id: string;
  readonly name: string;
  readonly address: string;
}

export interface PlaceReview {
  readonly externalId: string;
  readonly author: string;
  readonly rating: number;
  readonly text: string;
  readonly publishedAt: Date | null;
}

const BASE = 'https://places.googleapis.com/v1/';

async function placesCall(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
  // biome-ignore lint/suspicious/noExplicitAny: Google's JSON is read field by field.
): Promise<any> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new PlatformError(
      'temporary',
      'Google Maps is not answering right now. Try again soon.',
      error instanceof Error ? error.message : String(error),
    );
  }
  const body: GoogleJson = await response.json().catch(() => null);
  if (response.ok) return body ?? {};
  const detail =
    `${response.status} ${body?.error?.status ?? ''} ${body?.error?.message ?? ''}`.trim();
  if (response.status === 400 && /API key/i.test(body?.error?.message ?? ''))
    throw new PlatformError('permission', 'The Google Maps key cannot read places.', detail);
  if (response.status === 401 || response.status === 403)
    throw new PlatformError('permission', 'The Google Maps key cannot read places.', detail);
  if (response.status === 429)
    throw new PlatformError('rate', 'Google Maps says too many requests. Try again soon.', detail);
  if (response.status >= 500)
    throw new PlatformError(
      'temporary',
      'Google Maps is not answering right now. Try again soon.',
      detail,
    );
  throw new PlatformError('invalid', 'Google Maps could not find that place.', detail);
}

/** Businesses on Google Maps matching the words. */
export async function findPlace(
  apiKey: string,
  query: string,
  fetcher: Fetch = fetch,
): Promise<PlaceChoice[]> {
  const body = await placesCall(fetcher, `${BASE}places:searchText`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: query, regionCode: 'IN' }),
  });
  const places: PlaceChoice[] = [];
  for (const place of body.places ?? []) {
    if (!place?.id) continue;
    places.push({
      id: String(place.id),
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
    });
  }
  return places;
}

/** The place's rating, review count and newest reviews (Places API, at most five). */
export async function placeReviews(
  apiKey: string,
  placeId: string,
  fetcher: Fetch = fetch,
): Promise<{
  readonly rating: number | null;
  readonly total: number;
  readonly reviews: readonly PlaceReview[];
}> {
  const body = await placesCall(fetcher, `${BASE}places/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews' },
  });
  const reviews: PlaceReview[] = [];
  for (const review of body.reviews ?? []) {
    if (!review?.name) continue;
    const published = review.publishTime ? new Date(review.publishTime) : null;
    reviews.push({
      externalId: String(review.name),
      author: review.authorAttribution?.displayName ?? '',
      rating: Number(review.rating ?? 0),
      text: review.text?.text ?? review.originalText?.text ?? '',
      publishedAt: published && !Number.isNaN(published.getTime()) ? published : null,
    });
  }
  return {
    rating: typeof body.rating === 'number' ? body.rating : null,
    total: Number(body.userRatingCount ?? 0),
    reviews,
  };
}
