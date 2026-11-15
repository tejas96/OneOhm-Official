import type { DutySiteRecord } from '@oneohm/api-contracts';

/** iOS watches 20 regions at most; the server sends 18, and this keeps the cap on the phone too. */
export const FENCE_MAX = 18;

/** One region the phone watches: the site's id is its name, so an event finds its site. */
export interface FenceRegion {
  readonly identifier: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radius: number;
  readonly notifyOnEnter: true;
  readonly notifyOnExit: true;
}

/** The regions for today's sites: at most 18, each with its fence radius. */
export function regionsFor(sites: readonly DutySiteRecord[]): FenceRegion[] {
  return sites.slice(0, FENCE_MAX).map((site) => ({
    identifier: site.id,
    latitude: site.latitude,
    longitude: site.longitude,
    radius: site.radiusM,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));
}

/** Whether two region lists are the same, so a refresh that changed nothing registers nothing. */
export function sameRegions(a: readonly FenceRegion[], b: readonly FenceRegion[]): boolean {
  if (a.length !== b.length) return false;
  const key = (region: FenceRegion) =>
    `${region.identifier}|${region.latitude}|${region.longitude}|${region.radius}`;
  const left = new Set(a.map(key));
  return b.every((region) => left.has(key(region)));
}

/**
 * Whether the phone should watch regions now: on duty with the route recording, the "all the
 * time" permission (a fence event wakes a closed app only with it), and sites to watch.
 */
export function fenceWanted(input: {
  readonly onDuty: boolean;
  readonly backgroundAllowed: boolean;
  readonly sites: number;
}): boolean {
  return input.onDuty && input.backgroundAllowed && input.sites > 0;
}
