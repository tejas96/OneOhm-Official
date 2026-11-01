import type { Database } from '../client';
import { type AdminSeed, seedSuperAdmin } from './admin.seed';
import { seedCatalog } from './catalog.seed';
import { seedCompany, seedRateCard } from './company.seed';
import { seedRoles } from './roles.seed';

/** Everything OneOhm needs on day one. Safe to run again: existing rows are kept. */
export async function runSeed(db: Database, admin: AdminSeed): Promise<{ adminCreated: boolean }> {
  await seedCompany(db);
  await seedRateCard(db);
  await seedRoles(db);
  await seedCatalog(db);
  const adminCreated = await seedSuperAdmin(db, admin);
  return { adminCreated };
}
