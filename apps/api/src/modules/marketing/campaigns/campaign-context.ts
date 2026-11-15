import { companyProfile, type DatabaseExecutor } from '@oneohm/database';
import type { MarketingConfig, RunContext } from '@oneohm/marketing';
import type { Environment } from '../../../config/environment';
import type { ObjectStorageService } from '../../documents/object-storage.service';

/** Everything a campaign action needs, passed to plain functions. */
export interface CampaignContext {
  readonly db: DatabaseExecutor;
  readonly env: Environment;
  readonly config: MarketingConfig;
  readonly storage: ObjectStorageService;
}

/** The brand name for messages and links; "OneOhm" until the company profile is filled in. */
export async function brandNameOf(db: DatabaseExecutor): Promise<string> {
  const [row] = await db
    .select({ brandName: companyProfile.brandName })
    .from(companyProfile)
    .limit(1);
  return row?.brandName || 'OneOhm';
}

export async function runContextOf(ctx: CampaignContext): Promise<RunContext> {
  return { apiPublicUrl: ctx.env.API_PUBLIC_URL, businessName: await brandNameOf(ctx.db) };
}
