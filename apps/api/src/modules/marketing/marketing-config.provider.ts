import { type MarketingConfig, marketingConfig } from '@oneohm/marketing';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';

/** The marketing settings (mode, encryption key, Meta and Google apps), read once. */
export const MARKETING_CONFIG = Symbol('MARKETING_CONFIG');

export const marketingConfigProvider = {
  provide: MARKETING_CONFIG,
  inject: [ENVIRONMENT],
  useFactory: (env: Environment): MarketingConfig => marketingConfig(env),
};

export type { MarketingConfig };
