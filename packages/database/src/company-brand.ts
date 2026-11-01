import type { DatabaseExecutor } from './client';
import { companyProfile } from './schema/company.schema';

/**
 * The name the company trades under, from its profile (PRD Appendix A: never
 * hard-coded), for messages that name it. Empty when no profile is set up yet.
 */
export async function brandName(db: DatabaseExecutor): Promise<string> {
  const [row] = await db.select({ brand: companyProfile.brandName }).from(companyProfile).limit(1);
  return row?.brand.trim() ?? '';
}
