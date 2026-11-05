import type { IfscBranch } from '@oneohm/api-contracts';

const SERVICE = 'https://ifsc.razorpay.com';
const TIMEOUT_MS = 5_000;
export const IFSC_CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 5_000;

/** `branch: null` with `available: true` means no bank branch has this IFSC. */
export type IfscAnswer =
  | { readonly available: true; readonly branch: IfscBranch | null }
  | { readonly available: false; readonly branch: null };

type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Looks an IFSC up in Razorpay's public list (no key). Branches found and codes that do
 * not exist are remembered for 24 hours; a service that is down is not remembered, so the
 * next try asks again. The lookup never throws: down is `available: false`.
 */
export function createIfscLookup(fetchImpl: Fetch = fetch, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; branch: IfscBranch | null }>();

  return async function lookup(ifsc: string): Promise<IfscAnswer> {
    const hit = cache.get(ifsc);
    if (hit && now() - hit.at < IFSC_CACHE_MS) return { available: true, branch: hit.branch };
    const remember = (branch: IfscBranch | null): IfscAnswer => {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(ifsc, { at: now(), branch });
      return { available: true, branch };
    };
    try {
      const response = await fetchImpl(`${SERVICE}/${encodeURIComponent(ifsc)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) return remember(null);
      if (!response.ok) return { available: false, branch: null };
      const body = (await response.json()) as Record<string, unknown>;
      const bank = text(body.BANK);
      if (!bank) return { available: false, branch: null };
      return remember({
        ifsc,
        bank,
        branch: text(body.BRANCH) ?? '',
        city: text(body.CITY),
        state: text(body.STATE),
      });
    } catch {
      return { available: false, branch: null };
    }
  };
}
