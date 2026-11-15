import type { MetaAccess } from '../access';
import { PlatformError } from '../errors';
import type { AudienceChange, AudienceResult } from '../types';
import type { Graph } from './meta-graph';

const BATCH = 10_000;
const TERMS = "Accept Meta's Custom Audience terms once (Meta Ads Manager → Audiences).";

const NAMES = {
  interested: 'OneOhm · Interested, not bought',
  customers: 'OneOhm · Customers',
} as const;

const DESCRIPTIONS = {
  interested: 'People who asked about OneOhm and have not bought yet.',
  customers: 'People who bought from OneOhm.',
} as const;

/** Meta's "accept the Custom Audience terms" refusal and its cousins. */
function refusal(error: unknown): AudienceResult {
  if (error instanceof PlatformError) {
    if (error.retryable || error.kind === 'auth') throw error;
    if (/terms|custom audience/i.test(`${error.detail ?? ''} ${error.message}`)) {
      return { externalId: null, status: 'not_allowed', error: TERMS };
    }
    return { externalId: null, status: 'failed', error: error.message };
  }
  return { externalId: null, status: 'failed', error: 'Meta did not take the list. Try later.' };
}

export async function syncMetaAudience(
  graph: Graph,
  access: MetaAccess,
  change: AudienceChange,
): Promise<AudienceResult> {
  let id = change.externalId;
  try {
    if (!id) {
      id = (
        await graph.post<{ id: string }>(`${access.adAccountId}/customaudiences`, {
          name: NAMES[change.kind],
          subtype: 'CUSTOM',
          customer_file_source: 'USER_PROVIDED_ONLY',
          description: DESCRIPTIONS[change.kind],
        })
      ).id;
    }
    for (const [method, hashes] of [
      ['post', change.add],
      ['del', change.remove],
    ] as const) {
      for (let i = 0; i < hashes.length; i += BATCH) {
        const payload = {
          schema: 'PHONE_SHA256',
          data: hashes.slice(i, i + BATCH).map((hash) => [hash]),
        };
        await (method === 'post'
          ? graph.post(`${id}/users`, { payload })
          : graph.post(`${id}/users`, { payload, method: 'DELETE' }, { form: true }));
      }
    }
    return { externalId: id, status: 'ready' };
  } catch (error) {
    return { ...refusal(error), externalId: id };
  }
}

export async function ensureMetaLookalike(
  graph: Graph,
  access: MetaAccess,
  seedId: string,
  existing: string | null,
): Promise<AudienceResult> {
  if (existing) return { externalId: existing, status: 'ready' };
  try {
    const seed = await graph.get<{ approximate_count_lower_bound?: number }>(seedId, {
      fields: 'approximate_count_lower_bound',
    });
    if ((seed.approximate_count_lower_bound ?? 0) < 100) {
      return { externalId: null, status: 'waiting' };
    }
    const made = await graph.post<{ id: string }>(`${access.adAccountId}/customaudiences`, {
      name: 'OneOhm · Like your customers',
      subtype: 'LOOKALIKE',
      origin_audience_id: seedId,
      lookalike_spec: { ratio: 0.01, country: 'IN' },
    });
    return { externalId: made.id, status: 'ready' };
  } catch (error) {
    return refusal(error);
  }
}
