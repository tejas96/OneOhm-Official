import type { AdProvider } from '@oneohm/domain';
import type { MarketingConfig } from '@oneohm/marketing';
import type { Database } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';

export interface FlowDeps {
  readonly db: Database;
  readonly env: Environment;
  readonly config: MarketingConfig;
}

/** Where the sign-in page sends the person back to. */
export const callbackUrl = (env: Environment, provider: AdProvider): string =>
  `${env.API_PUBLIC_URL.replace(/\/$/, '')}/v1/marketing/connect/${provider}/callback`;
