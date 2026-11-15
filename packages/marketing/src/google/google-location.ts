import { PlatformError } from '../errors';
import type { LaunchInput } from '../types';
import type { GoogleContext } from './google-context';
import type { GoogleLocation } from './google-launch-ops';

/** The city as Google wants it: a point and radius when we know it, else Google's own city. */
export async function resolveLocation(
  ctx: GoogleContext,
  city: LaunchInput['city'],
): Promise<GoogleLocation> {
  if (city.latitude !== null && city.longitude !== null) {
    return { kind: 'proximity', latitude: city.latitude, longitude: city.longitude };
  }
  const answer = await ctx.client.post('geoTargetConstants:suggest', {
    locale: 'en',
    countryCode: 'IN',
    locationNames: { names: [city.name] },
  });
  for (const suggestion of answer.geoTargetConstantSuggestions ?? []) {
    const constant = suggestion?.geoTargetConstant;
    if (constant?.resourceName && String(constant.targetType).toLowerCase() === 'city') {
      return {
        kind: 'geo',
        resourceName: constant.resourceName,
        canonicalName: String(constant.canonicalName ?? '') || null,
      };
    }
  }
  throw new PlatformError(
    'invalid',
    `Google does not know the city "${city.name}". Pick a nearby bigger city.`,
  );
}
