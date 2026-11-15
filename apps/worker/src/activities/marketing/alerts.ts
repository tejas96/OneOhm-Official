import { type DatabaseExecutor, notify, notifyStaffHolders } from '@oneohm/database';
import { PlatformError } from '@oneohm/marketing';

/** The id of an alert about the connections as a whole (the subject column holds a UUID). */
export const NO_ID = '00000000-0000-0000-0000-000000000000';

/** The Marketing screen an alert opens. */
export type MarketingSubject =
  | { readonly type: 'marketing'; readonly id: string }
  | { readonly type: 'marketing_connections'; readonly id: typeof NO_ID }
  | { readonly type: 'marketing_reviews'; readonly id: string };

/** The connections subject. */
export const connectionsSubject = (): MarketingSubject => ({
  type: 'marketing_connections',
  id: NO_ID,
});

export interface TeamAlert {
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  /** The same key never alerts twice. */
  readonly dedupeKey: string;
  readonly subject: MarketingSubject;
}

/**
 * Alerts the people who run Marketing, and the campaign's maker when there is one. The maker's
 * key has the same shape as the others, so someone who is both hears once.
 */
export async function alertMarketing(
  db: DatabaseExecutor,
  alert: TeamAlert,
  creatorUserId: string | null = null,
): Promise<void> {
  const notice = {
    kind: alert.kind,
    title: alert.title,
    body: alert.body,
    subject: alert.subject,
    dedupeKey: alert.dedupeKey,
  };
  if (creatorUserId)
    await notify(
      db,
      { userId: creatorUserId },
      { ...notice, dedupeKey: `${alert.dedupeKey}:${creatorUserId}` },
    );
  await notifyStaffHolders(db, 'marketing.manage', notice);
}

/** Paise as rupees in Indian digit groups: 123456 → "₹1,235". */
export const rupees = (paise: number): string =>
  `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

export const providerName = (provider: string): string =>
  provider === 'google' ? 'Google' : 'Meta';

/** True for a platform refusal that waiting will not fix. */
export const isPermanent = (error: unknown): boolean =>
  error instanceof PlatformError && !error.retryable;
