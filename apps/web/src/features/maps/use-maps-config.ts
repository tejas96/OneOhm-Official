'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const MAPS_CONFIG_KEY = ['maps', 'config'] as const;

/**
 * The Google Maps browser key, read from the API at run time. `null` while it loads,
 * when it fails, or when no key is set: callers then keep the typed inputs only.
 */
export function useMapsKey(): string | null {
  return useMapsConfig().browserKey;
}

/**
 * The key and the vector Map ID (`null` when not set: the maps then draw raster tiles).
 * The live map takes the Map ID for smooth zoom.
 */
export function useMapsConfig(): { browserKey: string | null; mapId: string | null } {
  const config = useQuery({
    queryKey: MAPS_CONFIG_KEY,
    queryFn: () => expectStatus(api.maps.config(), 200),
    staleTime: 60 * 60_000,
    retry: false,
  });
  return { browserKey: config.data?.browserKey || null, mapId: config.data?.mapId || null };
}
