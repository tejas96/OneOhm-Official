import { PlatformError } from '../errors';
import type { LaunchInput } from '../types';
import type { Graph } from './meta-graph';

type Json = Record<string, unknown>;

/** Where the ad shows: a circle round the point, or the city Meta knows by name. */
export async function geoLocations(graph: Graph, city: LaunchInput['city']): Promise<Json> {
  if (city.latitude !== null && city.longitude !== null) {
    return {
      custom_locations: [
        {
          latitude: city.latitude,
          longitude: city.longitude,
          radius: Math.min(80, Math.max(1, city.radiusKm)),
          distance_unit: 'kilometer',
        },
      ],
    };
  }
  const found = await graph.get<{ data?: { key: string }[] }>('search', {
    type: 'adgeolocation',
    location_types: ['city'],
    country_code: 'IN',
    q: city.name,
  });
  const key = found.data?.[0]?.key;
  if (!key) {
    throw new PlatformError(
      'invalid',
      `Meta does not know the city "${city.name}". Pick a nearby bigger city.`,
    );
  }
  return { cities: [{ key }] };
}

const INSTAGRAM_POSITIONS = ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'];

/**
 * The apps the ad runs in. WhatsApp Status only works together with Instagram Stories, so
 * asking for it always brings Instagram's story along.
 */
export function placements(input: LaunchInput, withWhatsApp: boolean): Json {
  const wantsInstagram = input.channels.includes('instagram');
  const wantsFacebook = input.channels.includes('facebook');
  if (!withWhatsApp) {
    const platforms =
      wantsInstagram || wantsFacebook
        ? [...(wantsFacebook ? ['facebook'] : []), ...(wantsInstagram ? ['instagram'] : [])]
        : ['facebook', 'instagram'];
    return { publisher_platforms: platforms };
  }
  return {
    publisher_platforms: [...(wantsFacebook ? ['facebook'] : []), 'instagram', 'whatsapp'],
    instagram_positions: wantsInstagram ? INSTAGRAM_POSITIONS : ['story'],
    whatsapp_positions: ['status'],
  };
}

/** The full targeting block for the ad set. */
export function buildTargeting(input: LaunchInput, withWhatsApp: boolean, geo: Json): Json {
  const { interested, lookalike, customers } = input.audiences;
  const include = [interested, lookalike].filter((id): id is string => Boolean(id));
  return {
    geo_locations: geo,
    targeting_automation: { advantage_audience: 1 },
    ...placements(input, withWhatsApp),
    ...(include.length > 0 ? { custom_audiences: include.map((id) => ({ id })) } : {}),
    ...(customers ? { excluded_custom_audiences: [{ id: customers }] } : {}),
  };
}
