/**
 * Marketing defaults the business may change once (Marketing → Connections). Strings use ''
 * for "not set", so `withDefaults` keeps a saved value.
 */
export interface MarketingSettings {
  /** The daily budget a first campaign starts with, in paise (later ones copy the last). */
  readonly defaultDailyBudgetPaise: number;
  /** The city a first campaign targets; '' reads the most common lead city. */
  readonly defaultCity: string;
  /** How far around the city Meta shows ads, in km. */
  readonly radiusKm: number;
  /** Days an ad may spend with no lead before the owner is told. */
  readonly noLeadAlertDays: number;
  /** Below this prepaid ad balance (paise) the owner is told to top up. */
  readonly lowBalancePaise: number;
  /** The business's own website, used when a campaign needs a link; '' uses our landing page. */
  readonly websiteUrl: string;
  /** Meta and Google lead forms must link a privacy policy; '' uses our landing page's one. */
  readonly privacyPolicyUrl: string;
  /** The Google Maps place of the business, for review links and new reviews. */
  readonly googlePlaceId: string;
  /** Ask finished customers for a Google review on WhatsApp. */
  readonly askForReviews: boolean;
}

export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = {
  defaultDailyBudgetPaise: 50_000,
  defaultCity: '',
  radiusKm: 25,
  noLeadAlertDays: 2,
  lowBalancePaise: 100_000,
  websiteUrl: '',
  privacyPolicyUrl: '',
  googlePlaceId: '',
  askForReviews: true,
};

/** Google's page where a customer writes a review of this place. */
export function googleReviewLink(placeId: string): string | null {
  return placeId ? `https://search.google.com/local/writereview?placeid=${placeId}` : null;
}

/** Field problems in a marketing settings change, by field. */
export function checkMarketingSettings(value: MarketingSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(value.defaultDailyBudgetPaise) || value.defaultDailyBudgetPaise < 10_000)
    errors.defaultDailyBudgetPaise = 'Use at least ₹100 a day.';
  if (!Number.isInteger(value.radiusKm) || value.radiusKm < 1 || value.radiusKm > 80)
    errors.radiusKm = 'Use 1 to 80 km.';
  if (!Number.isInteger(value.noLeadAlertDays) || value.noLeadAlertDays < 1)
    errors.noLeadAlertDays = 'Use at least 1 day.';
  if (!Number.isInteger(value.lowBalancePaise) || value.lowBalancePaise < 0)
    errors.lowBalancePaise = 'Use 0 or more.';
  for (const key of ['websiteUrl', 'privacyPolicyUrl'] as const) {
    if (value[key] && !/^https:\/\/[^\s]+\.[^\s]+$/.test(value[key]))
      errors[key] = 'Use a full address starting with https://';
  }
  return errors;
}
