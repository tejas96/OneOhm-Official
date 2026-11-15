const DAY_MS = 86_400_000;

/** "★★★★☆" for a rating out of five. */
export const stars = (rating: number): string => {
  const whole = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(whole) + '☆'.repeat(5 - whole);
};

/** "New Google review: ★★★★★ from Asha". */
export const reviewWords = (rating: number, author: string): string =>
  `New Google review: ${stars(rating)}${author.trim() ? ` from ${author.trim()}` : ''}`;

/** A review is announced as new only when it was published in the last three days. */
export function shouldAnnounce(review: { readonly publishedAt: Date | null }, now: Date): boolean {
  return Boolean(review.publishedAt && now.getTime() - review.publishedAt.getTime() < 3 * DAY_MS);
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || 'there';
