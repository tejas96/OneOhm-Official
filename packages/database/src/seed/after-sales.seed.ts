import { DEFAULT_SERVICE_CATEGORIES, DEFAULT_WARRANTY_POLICY } from '@oneohm/domain';
import type { Database } from '../client';
import { serviceCategories, warrantyPolicy } from '../schema';

/**
 * The shipped service categories with their hours, and the default warranty years.
 * Owners change both in Settings, so rows that already exist are left alone.
 */
export async function seedAfterSales(db: Database): Promise<void> {
  await db
    .insert(serviceCategories)
    .values(
      DEFAULT_SERVICE_CATEGORIES.map((category, position) => ({
        key: category.key,
        label: category.label,
        customerLabel: category.customerLabel,
        responseHours: category.responseHours,
        resolutionHours: category.resolutionHours,
        system: category.system ?? false,
        position,
      })),
    )
    .onConflictDoNothing({ target: serviceCategories.key });
  await db
    .insert(warrantyPolicy)
    .values({ id: 'default', policy: DEFAULT_WARRANTY_POLICY })
    .onConflictDoNothing({ target: warrantyPolicy.id });
}
