import { marketingReviews, readBusinessSetting } from '@oneohm/database';
import { placeReviews } from '@oneohm/marketing';
import { alertMarketing } from './alerts';
import type { MarketingDeps } from './deps';
import { mergeJobData } from './job-store';
import { reviewWords, shouldAnnounce } from './review-rules';

/** Reads the business's Google rating and newest reviews; tells the owners about new ones once. */
export async function readReviews(deps: MarketingDeps, now: Date): Promise<number | null> {
  const { db, config, googleMapsKey } = deps;
  if (config.mode === 'sandbox' || !googleMapsKey) return null;
  const { googlePlaceId } = await readBusinessSetting(db, 'marketing');
  if (!googlePlaceId) return null;
  const read = await placeReviews(googleMapsKey, googlePlaceId, config.fetch);
  let fresh = 0;
  for (const review of read.reviews) {
    const [made] = await db
      .insert(marketingReviews)
      .values({
        externalId: review.externalId,
        author: review.author,
        rating: review.rating,
        text: review.text,
        publishedAt: review.publishedAt,
      })
      .onConflictDoNothing()
      .returning({ id: marketingReviews.id });
    if (!made) continue;
    fresh += 1;
    if (!shouldAnnounce(review, now)) continue;
    await alertMarketing(db, {
      kind: 'marketing_review',
      title: 'New Google review',
      body: reviewWords(review.rating, review.author),
      dedupeKey: `mkt_review:${review.externalId}`,
      subject: { type: 'marketing_reviews', id: made.id },
    });
  }
  await mergeJobData(db, 'reviews', { rating: read.rating, total: read.total });
  return fresh;
}
