import { randomUUID } from 'node:crypto';
import type { DatabaseExecutor } from '@oneohm/database';
import type { AdProvider } from '@oneohm/domain';
import type { MetaTools } from '../access';
import { saveConnection } from '../connection';

/** Practice posts, chat replies and lead form reads: answered here, nothing leaves OneOhm. */
export function createSandboxTools(): MetaTools {
  return {
    async publishPost(input) {
      return { postId: `sbx-post-${input.channel}-${randomUUID()}`, permalink: null };
    },
    async sendMessage() {
      return { messageId: `sbx-msg-${randomUUID()}` };
    },
    async readLead(leadgenId) {
      return {
        platformLeadId: leadgenId,
        name: 'Practice lead',
        phone: '+919800000001',
        email: null,
        city: 'Pune',
        adId: null,
        campaignExternalId: null,
        formId: null,
        platform: 'facebook',
        gclid: null,
        createdAt: new Date(),
        isTest: true,
      };
    },
    async profileName(channel) {
      return channel === 'instagram' ? '@practice.person' : 'Practice Person';
    },
  };
}

/** "Connects" a practice account in sandbox mode, so every Marketing screen can be tried. */
export async function sandboxConnect(
  db: DatabaseExecutor,
  key: string,
  provider: AdProvider,
  userId: string,
): Promise<void> {
  await saveConnection(db, key, provider, {
    status: 'connected',
    secrets:
      provider === 'meta'
        ? { userToken: 'sandbox', pageToken: 'sandbox' }
        : { refreshToken: 'sandbox' },
    accountId: provider === 'meta' ? 'act_sandbox' : '1234567890',
    accountName: provider === 'meta' ? 'Practice ad account' : 'Practice Google Ads',
    currency: 'INR',
    details:
      provider === 'meta'
        ? {
            sandbox: true,
            pageId: 'sbx-page',
            pageName: 'Practice page',
            instagramId: 'sbx-ig',
            instagramUsername: 'practice.solar',
            datasetId: 'sbx-dataset',
            statusPlacement: 'available',
          }
        : { sandbox: true, leadFormKey: 'sandbox-lead-form-key', conversionActions: {} },
    missing: [],
    lastError: null,
    tokenExpiresAt: null,
    connectedByUserId: userId,
    connectedAt: new Date(),
  });
}
