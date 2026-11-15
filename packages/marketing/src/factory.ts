import type { DatabaseExecutor } from '@oneohm/database';
import type { AdProvider } from '@oneohm/domain';
import type { MetaTools } from './access';
import type { MarketingConfig } from './config';
import { googleAccess, metaAccess, readConnection } from './connection';
import { createGooglePlatform } from './google/google-platform';
import { createMetaPlatform } from './meta/meta-platform';
import { createMetaTools } from './meta/meta-tools';
import { createSandboxPlatform } from './sandbox/sandbox-platform';
import { createSandboxTools } from './sandbox/sandbox-tools';
import type { AdPlatform } from './types';

/**
 * The platform to talk to, or null when it is not connected (or its app keys are missing).
 * In sandbox mode a practice platform stands in once "connected"; nothing leaves OneOhm.
 */
export async function adPlatform(
  db: DatabaseExecutor,
  config: MarketingConfig,
  provider: AdProvider,
): Promise<AdPlatform | null> {
  if (config.mode === 'sandbox') {
    const row = await readConnection(db, provider, 'sandbox');
    return row?.status === 'connected' ? createSandboxPlatform(provider, db) : null;
  }
  if (provider === 'meta') {
    if (!config.meta) return null;
    const access = await metaAccess(db, config.secretKey);
    return access ? createMetaPlatform(access, config.meta) : null;
  }
  if (!config.google) return null;
  const access = await googleAccess(db, config.secretKey);
  return access ? createGooglePlatform(access, config.google) : null;
}

/** Posts, Instagram and Facebook chat replies and lead form reads, or null without Meta. */
export async function metaTools(
  db: DatabaseExecutor,
  config: MarketingConfig,
): Promise<MetaTools | null> {
  if (config.mode === 'sandbox') {
    const row = await readConnection(db, 'meta', 'sandbox');
    return row?.status === 'connected' ? createSandboxTools() : null;
  }
  if (!config.meta) return null;
  const access = await metaAccess(db, config.secretKey);
  return access?.pageToken ? createMetaTools(access, config.meta) : null;
}
