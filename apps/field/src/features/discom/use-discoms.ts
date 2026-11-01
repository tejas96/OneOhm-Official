import type { Discom } from '@oneohm/api-contracts';
import { discomChoices } from '@oneohm/domain';
import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api, keys } from '@/api/api';

/** The company's DISCOMs; they change rarely, so the list is kept for the session. */
export function useDiscoms() {
  return useQuery({
    queryKey: keys.discoms,
    queryFn: () => unwrap(api.catalog.listDiscoms()),
    staleTime: 30 * 60_000,
  });
}

/** The DISCOMs to offer for a site: the active ones, and the site's own if it was retired. */
export function offeredDiscoms(all: readonly Discom[] | undefined, current: string | null) {
  return discomChoices(all ?? [], current);
}
