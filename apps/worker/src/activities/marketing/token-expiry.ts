import { marketingConnections } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { alertMarketing, connectionsSubject } from './alerts';
import type { MarketingDeps } from './deps';

const WEEK_MS = 7 * 86_400_000;

/** Meta's login runs out within a week: ask the owner to connect again (once a day). */
export async function alertTokenExpiry(deps: MarketingDeps, now: Date): Promise<number> {
  const [meta] = await deps.db
    .select()
    .from(marketingConnections)
    .where(eq(marketingConnections.provider, 'meta'));
  const ends = meta?.tokenExpiresAt;
  if (!ends || (meta?.status !== 'connected' && meta?.status !== 'in_review')) return 0;
  if (ends.getTime() - now.getTime() > WEEK_MS) return 0;
  await alertMarketing(deps.db, {
    kind: 'marketing_reconnect',
    title: 'Connect Meta again soon',
    body: 'Connect Meta again this week so your ads keep running.',
    dedupeKey: `mkt_reconnect:meta:${todayIn(deps.timeZone, now)}`,
    subject: connectionsSubject(),
  });
  return 1;
}
