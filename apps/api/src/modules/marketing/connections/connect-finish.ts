import type { AdProvider } from '@oneohm/domain';
import {
  type AccountChoice,
  type GoogleCustomerChoice,
  type GoogleSecrets,
  googlePrepare,
  type MetaAdAccountChoice,
  type MetaDetails,
  type MetaPageChoice,
  type MetaSecrets,
  metaPrepare,
  PlatformError,
  randomKey,
  readConnection,
  saveConnection,
} from '@oneohm/marketing';
import { recordAudit } from '../../../common/audit';
import { currencyProblem, googleOutcome, metaOutcome } from './connect-decision';

import { type FlowDeps } from './connect-flow-types';

/** Meta tokens kept while the person still has to pick: the extra fields drop once they do. */
export interface PendingMeta extends MetaSecrets {
  readonly pages: Readonly<
    Record<string, { token: string; instagramId: string | null; instagramUsername: string | null }>
  >;
  readonly accounts: Readonly<Record<string, { currency: string; accountStatus: number }>>;
}

export interface PendingGoogle extends GoogleSecrets {
  readonly customers: Readonly<
    Record<string, { currency: string; loginCustomerId: string | null }>
  >;
  readonly inReview: boolean;
}

/** The choice as the screen shows it: never carries a token. */
export const plain = ({ id, name, note }: AccountChoice): AccountChoice => ({ id, name, note });
const digits = (id: string) => id.replace(/\D/g, '');

export async function audit(deps: FlowDeps, userId: string, action: string, provider: AdProvider) {
  await recordAudit(deps.db, userId, action, 'marketing_connection', provider, { provider });
}

/**
 * An account not in rupees is not connected. The connection asks to pick again; when the person
 * was already choosing, their saved choices and tokens stay so another account can be picked.
 */
async function holdForRupees(
  deps: FlowDeps,
  provider: 'meta' | 'google',
  words: string,
  fresh: () => Parameters<typeof saveConnection>[3],
): Promise<void> {
  const row = await readConnection(deps.db, provider);
  const choosing = row?.secrets && !row.accountId;
  if (choosing) {
    await saveConnection(deps.db, deps.config.secretKey, provider, {
      status: 'needs_attention',
      lastError: words,
    });
    return;
  }
  await saveConnection(deps.db, deps.config.secretKey, provider, fresh());
}

export async function finishMeta(
  deps: FlowDeps,
  input: {
    readonly userId: string;
    readonly userToken: string;
    readonly expiresAt: Date | null;
    readonly missing: readonly string[];
    readonly adAccount: MetaAdAccountChoice;
    readonly page: MetaPageChoice;
  },
): Promise<void> {
  const { config, env, db } = deps;
  if (!config.meta) throw new PlatformError('invalid', 'Meta is not set up on the server yet.');
  const { adAccount, page } = input;
  const wrongMoney = currencyProblem(adAccount.currency);
  if (wrongMoney) {
    const pending: PendingMeta = {
      userToken: input.userToken,
      pageToken: null,
      pages: {
        [page.id]: {
          token: page.pageToken,
          instagramId: page.instagramId,
          instagramUsername: page.instagramUsername,
        },
      },
      accounts: {
        [adAccount.id]: { currency: adAccount.currency, accountStatus: adAccount.accountStatus },
      },
    };
    return holdForRupees(deps, 'meta', wrongMoney, () => ({
      status: 'needs_attention',
      secrets: pending,
      accountId: null,
      accountName: null,
      currency: null,
      details: { adAccountChoices: [plain(adAccount)], pageChoices: [plain(page)] },
      missing: input.missing,
      tokenExpiresAt: input.expiresAt,
      lastError: wrongMoney,
    }));
  }
  const adAccountId = adAccount.id.startsWith('act_') ? adAccount.id : `act_${adAccount.id}`;
  const waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null;
  const prepared = await metaPrepare(config.meta, {
    userToken: input.userToken,
    pageToken: page.pageToken,
    pageId: page.id,
    adAccountId,
    whatsappBusinessAccountId: waba,
  });
  const outcome = metaOutcome(input.missing, adAccount.accountStatus);
  const details: MetaDetails = {
    pageId: page.id,
    pageName: page.name,
    statusPlacement: 'unknown',
    adAccountChoices: [],
    pageChoices: [],
    ...(page.instagramId ? { instagramId: page.instagramId } : {}),
    ...(page.instagramUsername ? { instagramUsername: page.instagramUsername } : {}),
    ...(prepared.datasetId ? { datasetId: prepared.datasetId } : {}),
    ...(waba ? { whatsappBusinessAccountId: waba } : {}),
  };
  await saveConnection(db, config.secretKey, 'meta', {
    status: outcome.status,
    secrets: { userToken: input.userToken, pageToken: page.pageToken },
    accountId: adAccountId,
    accountName: adAccount.name,
    currency: adAccount.currency,
    details,
    missing: input.missing,
    tokenExpiresAt: input.expiresAt,
    lastError: outcome.lastError,
    connectedByUserId: input.userId,
    connectedAt: new Date(),
  });
  await audit(deps, input.userId, 'marketing.connect', 'meta');
}

export async function finishGoogle(
  deps: FlowDeps,
  input: {
    readonly userId: string;
    readonly refreshToken: string;
    readonly customer: GoogleCustomerChoice;
    readonly inReview: boolean;
  },
): Promise<void> {
  const { config, db } = deps;
  if (!config.google) throw new PlatformError('invalid', 'Google is not set up on the server yet.');
  const wrongMoney = currencyProblem(input.customer.currency);
  if (wrongMoney) {
    const pending: PendingGoogle = {
      refreshToken: input.refreshToken,
      inReview: input.inReview,
      customers: {
        [input.customer.id]: {
          currency: input.customer.currency,
          loginCustomerId: input.customer.loginCustomerId,
        },
      },
    };
    return holdForRupees(deps, 'google', wrongMoney, () => ({
      status: 'needs_attention',
      secrets: pending,
      accountId: null,
      accountName: null,
      currency: null,
      details: { customerChoices: [plain(input.customer)] },
      missing: [],
      lastError: wrongMoney,
    }));
  }
  const customerId = digits(input.customer.id);
  const prepared = await googlePrepare(config.google, {
    refreshToken: input.refreshToken,
    customerId,
    loginCustomerId: input.customer.loginCustomerId,
  });
  const enhanced = (prepared as { enhancedConversionsForLeads?: boolean })
    .enhancedConversionsForLeads;
  const existing = (await readConnection(db, 'google'))?.details as
    | { leadFormKey?: string }
    | undefined;
  const outcome = googleOutcome(input.inReview);
  await saveConnection(db, config.secretKey, 'google', {
    status: outcome.status,
    secrets: { refreshToken: input.refreshToken },
    accountId: customerId,
    accountName: input.customer.name,
    currency: input.customer.currency,
    details: {
      conversionActions: prepared.conversionActions,
      leadFormKey: existing?.leadFormKey ?? randomKey(),
      customerChoices: [],
      ...(enhanced === undefined ? {} : { enhancedConversionsForLeads: enhanced }),
      ...(input.customer.loginCustomerId
        ? { loginCustomerId: input.customer.loginCustomerId }
        : {}),
    },
    missing: outcome.missing,
    lastError: null,
    tokenExpiresAt: null,
    connectedByUserId: input.userId,
    connectedAt: new Date(),
  });
  await audit(deps, input.userId, 'marketing.connect', 'google');
}
