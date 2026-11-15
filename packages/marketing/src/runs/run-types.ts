import type { MarketingConfig } from '../config';

export type { MarketingConfig };

/** What a run needs to build public links and words. */
export interface RunContext {
  /** Where Meta, Google and customers reach the API (`API_PUBLIC_URL`). */
  readonly apiPublicUrl: string;
  /** The brand name from the company profile. */
  readonly businessName: string;
}

/** The public link to a campaign photo or video (`/v1/m/<mediaId>`). */
export const mediaPublicUrl = (apiPublicUrl: string, mediaId: string) =>
  `${apiPublicUrl.replace(/\/$/, '')}/v1/m/${mediaId}`;

/** The campaign's landing page (`/v1/go/<code>`). */
export const landingPageUrl = (apiPublicUrl: string, code: string) =>
  `${apiPublicUrl.replace(/\/$/, '')}/v1/go/${encodeURIComponent(code)}`;

/** One person a WhatsApp campaign can reach. */
export interface SegmentPerson {
  readonly phoneE164: string;
  readonly name: string;
  readonly leadId: string | null;
  readonly customerId: string | null;
}

/** Today's calendar date on the business clock (India), as `YYYY-MM-DD`. */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
