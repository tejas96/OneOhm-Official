import { PlatformError } from '../errors';
import type { AudienceChange, AudienceResult } from '../types';
import { type GoogleContext, gaqlText } from './google-context';
import { googleMessage } from './google-errors';

const BATCH = 10_000;
const LIST_NAME = {
  interested: 'OneOhm · Interested, not bought',
  customers: 'OneOhm · Customers',
} as const;
const NOT_ALLOWED = 'Google opens customer lists once the account qualifies; your ads still run.';

async function ensureList(ctx: GoogleContext, kind: AudienceChange['kind']): Promise<string> {
  const customer = ctx.access.customerId;
  const name = LIST_NAME[kind];
  const [found] = await ctx.client.search(
    customer,
    `SELECT user_list.resource_name FROM user_list WHERE user_list.name = '${gaqlText(name)}'`,
  );
  if (found?.userList?.resourceName) return found.userList.resourceName;
  const made = await ctx.client.mutate(customer, 'userLists:mutate', {
    operations: [
      {
        create: {
          name,
          crmBasedUserList: { uploadKeyType: 'CONTACT_INFO', dataSourceType: 'FIRST_PARTY' },
          membershipLifeSpan: 30,
        },
      },
    ],
  });
  return made.results?.[0]?.resourceName as string;
}

/** Google's words for the failed rows of one batch, or null when every row went in. */
function partialFailureWords(answer: { partialFailureError?: unknown }): string | null {
  const error = answer?.partialFailureError as { message?: string } | undefined;
  if (!error) return null;
  const words = googleMessage({ error: error }) || String(error.message ?? '');
  return words || 'Google refused some people in the list.';
}

/** One upload job: create the job, add the people in batches, run it. Returns words on a refusal. */
async function runJob(
  ctx: GoogleContext,
  userList: string,
  action: 'create' | 'remove',
  hashes: readonly string[],
): Promise<string | null> {
  const job = await ctx.client.mutate(ctx.access.customerId, 'offlineUserDataJobs:create', {
    job: {
      type: 'CUSTOMER_MATCH_USER_LIST',
      customerMatchUserListMetadata: {
        userList,
        consent: { adUserData: 'GRANTED', adPersonalization: 'GRANTED' },
      },
    },
  });
  const name = job.resourceName as string;
  for (let start = 0; start < hashes.length; start += BATCH) {
    const answer = await ctx.client.post(`${name}:addOperations`, {
      operations: hashes
        .slice(start, start + BATCH)
        .map((hashedPhoneNumber) => ({ [action]: { userIdentifiers: [{ hashedPhoneNumber }] } })),
      enablePartialFailure: true,
    });
    const words = partialFailureWords(answer);
    if (words) return words;
  }
  await ctx.client.post(`${name}:run`, {});
  return null;
}

/** One upload job per list per run: adds first; removes wait for the next run. */
async function oneJob(
  ctx: GoogleContext,
  externalId: string,
  change: AudienceChange,
): Promise<AudienceResult> {
  const adding = change.add.length > 0;
  const hashes = adding ? change.add : change.remove;
  if (hashes.length === 0) return { externalId, status: 'ready' };
  const refused = await runJob(ctx, externalId, adding ? 'create' : 'remove', hashes);
  if (refused) return { externalId, status: 'failed', error: refused };
  return adding && change.remove.length > 0
    ? { externalId, status: 'ready', error: 'People to remove wait for the next update.' }
    : { externalId, status: 'ready' };
}

/** Keeps a Customer Match list in step with our people. */
export async function syncGoogleAudience(
  ctx: GoogleContext,
  change: AudienceChange,
): Promise<AudienceResult> {
  let externalId = change.externalId;
  try {
    externalId = change.externalId ?? (await ensureList(ctx, change.kind));
    return await oneJob(ctx, externalId, change);
  } catch (error) {
    if (error instanceof PlatformError) {
      if (error.kind === 'not_available') {
        return { externalId, status: 'not_allowed', error: NOT_ALLOWED };
      }
      if (error.kind !== 'auth' && !error.retryable)
        return { externalId, status: 'failed', error: error.message };
    }
    throw error;
  }
}
