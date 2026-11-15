import type { DutySiteRecord } from '@oneohm/api-contracts';

/** No fence on the web: there is no background task there. */
export async function syncFence(_userId: string, _sites: readonly DutySiteRecord[]): Promise<void> {
  // Not on the web.
}

export async function stopFence(_userId?: string): Promise<void> {
  // Not on the web.
}
