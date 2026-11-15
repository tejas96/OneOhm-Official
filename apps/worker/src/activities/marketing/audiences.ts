import { marketingAudienceMembers, marketingAudiences } from '@oneohm/database';
import type { AdProvider } from '@oneohm/domain';
import {
  type AdPlatform,
  type AudienceResult,
  hashPhoneFor,
  PlatformError,
} from '@oneohm/marketing';
import { and, count, eq, inArray } from 'drizzle-orm';
import { customerPhones, interestedPhones } from './audience-data';
import { capChanges, diffAudience, MAX_CHANGES } from './audience-diff';
import { fullUploadDue, markFullUpload } from './audience-refresh';
import type { MarketingDeps } from './deps';
import { forEachPlatform } from './providers';

type Kind = 'interested' | 'customers';
const CHUNK = 1000;

async function save(
  deps: MarketingDeps,
  provider: AdProvider,
  kind: 'interested' | 'customers' | 'lookalike',
  result: AudienceResult,
  size: number | null,
  now: Date,
): Promise<void> {
  const values = {
    externalId: result.externalId,
    status: result.status,
    lastError: result.error ?? null,
    syncedAt: now,
    ...(size === null ? {} : { size }),
  };
  await deps.db
    .insert(marketingAudiences)
    .values({ provider, kind, ...values })
    .onConflictDoUpdate({
      target: [marketingAudiences.provider, marketingAudiences.kind],
      set: values,
    });
}

/** A refusal that is only about this list is kept as its status; a login problem is thrown. */
function refusal(error: unknown): AudienceResult {
  if (!(error instanceof PlatformError) || error.kind === 'auth') throw error;
  return {
    externalId: null,
    status:
      error.kind === 'not_available' || error.kind === 'permission' ? 'not_allowed' : 'failed',
    error: error.message,
  };
}

async function syncKind(
  deps: MarketingDeps,
  platform: AdPlatform,
  provider: AdProvider,
  kind: Kind,
  phones: readonly string[],
  room: number,
  now: Date,
): Promise<number> {
  const { db } = deps;
  const wanted = new Set(phones.filter(Boolean).map((phone) => hashPhoneFor(provider, phone)));
  const where = and(
    eq(marketingAudienceMembers.provider, provider),
    eq(marketingAudienceMembers.kind, kind),
  );
  // Google forgets members after 30 days: every 25 days the whole list goes up again.
  const refill = provider === 'google' && (await fullUploadDue(db, kind, now));
  if (refill) await db.delete(marketingAudienceMembers).where(where);
  const onList = new Set(
    (
      await db
        .select({ hash: marketingAudienceMembers.hash })
        .from(marketingAudienceMembers)
        .where(where)
    ).map((row) => row.hash),
  );
  const [saved] = await db
    .select()
    .from(marketingAudiences)
    .where(and(eq(marketingAudiences.provider, provider), eq(marketingAudiences.kind, kind)));
  const change = capChanges(diffAudience(wanted, onList), room);
  if (change.add.length + change.remove.length === 0 && saved?.externalId) return 0;
  if (change.add.length === 0 && wanted.size === 0 && !saved?.externalId) return 0;
  let result: AudienceResult;
  try {
    result = await platform.syncAudience({
      kind,
      externalId: saved?.externalId ?? null,
      add: change.add,
      remove: change.remove,
    });
  } catch (error) {
    const failed = refusal(error);
    await save(
      deps,
      provider,
      kind,
      { ...failed, externalId: saved?.externalId ?? null },
      null,
      now,
    );
    return 0;
  }
  // Members are kept only for what the platform really took.
  if (result.status !== 'ready') {
    await save(
      deps,
      provider,
      kind,
      { ...result, externalId: result.externalId ?? saved?.externalId ?? null },
      null,
      now,
    );
    return 0;
  }
  for (let at = 0; at < change.add.length; at += CHUNK)
    await db
      .insert(marketingAudienceMembers)
      .values(change.add.slice(at, at + CHUNK).map((hash) => ({ provider, kind, hash })))
      .onConflictDoNothing();
  // Google sends removes only in a call with no adds: otherwise they wait for the next run.
  const removed = provider === 'google' && change.add.length > 0 ? [] : change.remove;
  for (let at = 0; at < removed.length; at += CHUNK)
    await db
      .delete(marketingAudienceMembers)
      .where(and(where, inArray(marketingAudienceMembers.hash, removed.slice(at, at + CHUNK))));
  const [size] = await db.select({ n: count() }).from(marketingAudienceMembers).where(where);
  await save(deps, provider, kind, result, size?.n ?? 0, now);
  if (refill) await markFullUpload(db, kind, now);
  return change.add.length + removed.length;
}

/** Keeps each platform's lists of interested people and customers in step with the leads. */
export async function syncAudiences(deps: MarketingDeps, now: Date): Promise<number | null> {
  const { db, config, timeZone } = deps;
  const pace = { key: 'audiences', cadence: 'daily', timeZone, now } as const;
  const interested = await interestedPhones(db, now);
  const customers = await customerPhones(db);
  let room = MAX_CHANGES;
  return forEachPlatform(
    db,
    config,
    async (platform, provider) => {
      let sent = 0;
      for (const [kind, phones] of [
        ['interested', interested],
        ['customers', customers],
      ] as const) {
        const done = await syncKind(deps, platform, provider, kind, phones, room, now);
        room -= done;
        sent += done;
      }
      if (provider === 'meta') await lookalike(deps, platform, now);
      return sent;
    },
    pace,
  );
}

/** Meta: a look-alike list built from the customers list, once it exists. */
async function lookalike(deps: MarketingDeps, platform: AdPlatform, now: Date): Promise<void> {
  const rows = await deps.db
    .select()
    .from(marketingAudiences)
    .where(eq(marketingAudiences.provider, 'meta'));
  const customersList = rows.find((row) => row.kind === 'customers')?.externalId;
  if (!customersList) return;
  const existing = rows.find((row) => row.kind === 'lookalike')?.externalId ?? null;
  let result: AudienceResult;
  try {
    result = await platform.ensureLookalike(customersList, existing);
  } catch (error) {
    result = refusal(error);
  }
  await save(
    deps,
    'meta',
    'lookalike',
    { ...result, externalId: result.externalId ?? existing },
    null,
    now,
  );
}
