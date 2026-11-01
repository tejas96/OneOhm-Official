import type { Database } from '../client';
import { backfillLedger } from '../ledger/backfill';
import { type AdminSeed, seedSuperAdmin } from './admin.seed';
import { seedAfterSales } from './after-sales.seed';
import { seedCatalog } from './catalog.seed';
import { seedCompany, seedRateCard } from './company.seed';
import { seedDocumentRequirements } from './document-requirements.seed';
import { seedStockLocations } from './inventory.seed';
import { seedLeadSteps } from './lead-steps.seed';
import { seedRoles } from './roles.seed';
import { seedSkills } from './skills.seed';
import { seedWorkforcePolicy } from './workforce.seed';

/** Everything OneOhm needs on day one. Safe to run again: existing rows are kept. */
export async function runSeed(db: Database, admin: AdminSeed): Promise<{ adminCreated: boolean }> {
  await seedCompany(db);
  await seedRateCard(db);
  await seedRoles(db);
  await seedSkills(db);
  await seedLeadSteps(db);
  await seedDocumentRequirements(db);
  await seedCatalog(db);
  await seedStockLocations(db);
  await seedWorkforcePolicy(db);
  await seedAfterSales(db);
  const adminCreated = await seedSuperAdmin(db, admin);
  await backfillLedger(db);
  return { adminCreated };
}
