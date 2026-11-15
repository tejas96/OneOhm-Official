import { type Database, leads, marketingConversions } from '@oneohm/database';
import { AD_PROVIDERS, type AdProvider } from '@oneohm/domain';
import {
  adPlatform,
  type ConversionInput,
  type ConversionOutcome,
  errorDetail,
  type MarketingConfig,
  PlatformError,
  plainError,
} from '@oneohm/marketing';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { afterFailedTry, bareLeadId, isSetupGap, MAX_ATTEMPTS } from './conversion-facts';
import { markNeedsAttention } from './providers';

const BATCH = 200;
const PER_RUN = 1000;

type Pending = {
  readonly row: typeof marketingConversions.$inferSelect;
  readonly lead: typeof leads.$inferSelect;
};

const inputOf = ({ row, lead }: Pending): ConversionInput => ({
  id: row.id,
  event: row.event,
  eventAt: row.eventAt,
  valuePaise: row.valuePaise,
  phoneE164: lead.phoneE164,
  email: lead.email,
  gclid: lead.gclid,
  fbclid: lead.fbclid,
  ctwaClid: lead.ctwaClid,
  platformLeadId: bareLeadId(lead.platformLeadId),
  leadCreatedAt: lead.createdAt,
});

/** Tells each platform the steps not told yet, 200 at a time. Returns how many were told. */
export async function sendConversions(
  db: Database,
  config: MarketingConfig,
  now: Date,
): Promise<number> {
  let told = 0;
  for (const provider of AD_PROVIDERS) {
    const pending: Pending[] = await db
      .select({ row: marketingConversions, lead: leads })
      .from(marketingConversions)
      .innerJoin(leads, eq(leads.id, marketingConversions.leadId))
      .where(
        and(
          eq(marketingConversions.provider, provider),
          eq(marketingConversions.status, 'pending'),
          lt(marketingConversions.attempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(marketingConversions.createdAt)
      .limit(PER_RUN);
    if (pending.length === 0) continue;
    // Not connected: they wait, and no try is counted.
    const platform = await adPlatform(db, config, provider);
    if (!platform) continue;
    for (let at = 0; at < pending.length; at += BATCH) {
      const batch = pending.slice(at, at + BATCH);
      try {
        const outcomes = await platform.sendConversions(batch.map(inputOf));
        told += await saveOutcomes(db, batch, outcomes, now);
      } catch (error) {
        if (await keepForLater(db, config, provider, batch, error)) break;
      }
    }
  }
  return told;
}

/** Writes what the platform said per step. Only `failed` is final; `retry` stays pending. */
async function saveOutcomes(
  db: Database,
  batch: readonly Pending[],
  outcomes: readonly ConversionOutcome[],
  now: Date,
): Promise<number> {
  const rows = new Map(batch.map(({ row }) => [row.id, row]));
  for (const outcome of outcomes) {
    const row = rows.get(outcome.id);
    const words = outcome.error ?? 'The platform asked us to try again later.';
    const next =
      outcome.status === 'retry' && row
        ? afterFailedTry(row.attempts, words, false, isSetupGap(words))
        : {
            status: outcome.status === 'retry' ? ('pending' as const) : outcome.status,
            lastError: outcome.error ?? null,
            ...(outcome.status === 'sent' ? { sentAt: now } : {}),
          };
    await db.update(marketingConversions).set(next).where(eq(marketingConversions.id, outcome.id));
  }
  return outcomes.filter((outcome) => outcome.status === 'sent').length;
}

/** Keeps the rows pending with the platform's words, and no try counted. */
async function holdRows(db: Database, batch: readonly Pending[], words: string): Promise<void> {
  await db
    .update(marketingConversions)
    .set({ lastError: words })
    .where(
      inArray(
        marketingConversions.id,
        batch.map(({ row }) => row.id),
      ),
    );
}

/**
 * A thrown refusal. A login problem marks the connection and keeps every row waiting; a missing
 * permission or feature is a setup gap, so rows wait too, with no try counted. Anything else
 * counts one try (a refusal for good fails). True: stop with this platform for now.
 */
async function keepForLater(
  db: Database,
  config: MarketingConfig,
  provider: AdProvider,
  batch: readonly Pending[],
  error: unknown,
): Promise<boolean> {
  console.error(`[marketing] ${provider} conversions: ${errorDetail(error)}`);
  const kind = error instanceof PlatformError ? error.kind : null;
  if (kind === 'auth') {
    await markNeedsAttention(db, config, provider, plainError(error));
    await holdRows(db, batch, plainError(error));
    return true;
  }
  if (kind === 'permission' || kind === 'not_available') {
    await holdRows(db, batch, plainError(error));
    return true;
  }
  for (const { row } of batch) {
    const next = afterFailedTry(row.attempts, plainError(error), kind === 'invalid');
    await db.update(marketingConversions).set(next).where(eq(marketingConversions.id, row.id));
  }
  return false;
}
