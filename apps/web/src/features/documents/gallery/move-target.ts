import type { DocumentHome } from '@oneohm/api-contracts';

/**
 * Where the move sheet files a paper for the home picked (by its property): on the home's
 * project, else (a home that is only a lead) on its property; anything else is no home.
 */
export function moveTarget(
  homes: readonly DocumentHome[],
  picked: string,
): { projectId: string | null; propertyId: string | null } {
  const home = homes.find((one) => one.propertyId === picked);
  if (!home) return { projectId: null, propertyId: null };
  return home.projectId
    ? { projectId: home.projectId, propertyId: null }
    : { projectId: null, propertyId: home.propertyId };
}
