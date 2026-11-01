import type { SiteDistance } from '@oneohm/api-contracts';
import { companyProfile, type DatabaseExecutor, properties } from '@oneohm/database';
import { geoPoint, roadDistanceKm } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import type { CatalogService } from '../catalog/catalog.service';

/**
 * The road distance from the company's base to a site (PRD 3.9 B): the straight line
 * between their GPS points times the road factor on the rate card. Sales can still type
 * the distance; this only fills it in.
 */
export async function siteDistance(
  db: DatabaseExecutor,
  catalog: CatalogService,
  propertyId: string,
): Promise<SiteDistance> {
  const [property] = await db
    .select({ latitude: properties.latitude, longitude: properties.longitude })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property) throw notFound('That site');
  const [company] = await db
    .select({ latitude: companyProfile.baseLatitude, longitude: companyProfile.baseLongitude })
    .from(companyProfile)
    .limit(1);
  const base = geoPoint(company?.latitude, company?.longitude);
  if (!base) return { distanceKm: null, missing: 'base' };
  const site = geoPoint(property.latitude, property.longitude);
  if (!site) return { distanceKm: null, missing: 'site' };
  const card = await catalog.rateCard();
  return { distanceKm: roadDistanceKm(base, site, card.travel.roadFactorBp), missing: null };
}
