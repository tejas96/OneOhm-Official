import type { AdProvider } from '@oneohm/domain';
import {
  type AccountChoice,
  googleDiscover,
  googleExchangeCode,
  type MetaDetails,
  metaDiscover,
  metaExchangeCode,
  openSecrets,
  PlatformError,
  readConnection,
  saveConnection,
} from '@oneohm/marketing';
import { checkChoice, decideGoogle, decideMeta, PICK_WORDS } from './connect-decision';
import {
  audit,
  finishGoogle,
  finishMeta,
  type PendingGoogle,
  type PendingMeta,
  plain,
} from './connect-finish';
import { callbackUrl, type FlowDeps } from './connect-flow-types';

export { callbackUrl, type FlowDeps };

/** What the sign-in page gave back: connect at once, or save the choices for the person. */
export async function completeSignIn(
  deps: FlowDeps,
  provider: AdProvider,
  userId: string,
  code: string,
): Promise<void> {
  const { config, db, env } = deps;
  const redirectUri = callbackUrl(env, provider);
  if (provider === 'meta') {
    if (!config.meta) throw new PlatformError('invalid', 'Meta is not set up on the server yet.');
    const { userToken, expiresAt } = await metaExchangeCode(config.meta, code, redirectUri);
    const found = await metaDiscover(config.meta, userToken);
    const decision = decideMeta(found);
    if (decision.kind === 'error') throw new PlatformError('account', decision.message);
    if (decision.kind === 'pick')
      return finishMeta(deps, {
        userId,
        userToken,
        expiresAt,
        missing: found.missing,
        adAccount: decision.adAccount,
        page: decision.page,
      });
    const pending: PendingMeta = {
      userToken,
      pageToken: null,
      pages: Object.fromEntries(
        found.pages.map((p) => [
          p.id,
          {
            token: p.pageToken,
            instagramId: p.instagramId,
            instagramUsername: p.instagramUsername,
          },
        ]),
      ),
      accounts: Object.fromEntries(
        found.adAccounts.map((a) => [
          a.id,
          { currency: a.currency, accountStatus: a.accountStatus },
        ]),
      ),
    };
    await saveConnection(db, config.secretKey, 'meta', {
      status: 'needs_attention',
      secrets: pending,
      accountId: null,
      accountName: null,
      details: {
        adAccountChoices: found.adAccounts.map(plain),
        pageChoices: found.pages.map(plain),
      },
      missing: found.missing,
      tokenExpiresAt: expiresAt,
      lastError: PICK_WORDS,
    });
    return;
  }
  if (!config.google) throw new PlatformError('invalid', 'Google is not set up on the server yet.');
  const { refreshToken } = await googleExchangeCode(config.google, code, redirectUri);
  const found = await googleDiscover(config.google, refreshToken);
  const decision = decideGoogle(found);
  if (decision.kind === 'error') throw new PlatformError('account', decision.message);
  if (decision.kind === 'pick')
    return finishGoogle(deps, {
      userId,
      refreshToken,
      customer: decision.customer,
      inReview: found.inReview,
    });
  const pending: PendingGoogle = {
    refreshToken,
    inReview: found.inReview,
    customers: Object.fromEntries(
      found.customers.map((c) => [
        c.id,
        { currency: c.currency, loginCustomerId: c.loginCustomerId },
      ]),
    ),
  };
  await saveConnection(db, config.secretKey, 'google', {
    status: 'needs_attention',
    secrets: pending,
    accountId: null,
    accountName: null,
    details: { customerChoices: found.customers.map(plain) },
    missing: [],
    lastError: 'Pick your Google Ads account.',
  });
}

/** The person's pick when the login saw several accounts or pages. */
export async function chooseAccount(
  deps: FlowDeps,
  provider: AdProvider,
  userId: string,
  picked: { readonly accountId: string; readonly pageId?: string | undefined },
): Promise<void> {
  const { db, config } = deps;
  const row = await readConnection(db, provider);
  const details = (row?.details ?? {}) as MetaDetails & {
    customerChoices?: readonly AccountChoice[];
  };
  if (!row?.secrets || row.accountId)
    throw new PlatformError('invalid', 'Nothing to pick now. Open Connect again.');
  const accounts = provider === 'meta' ? details.adAccountChoices : details.customerChoices;
  const wrong = checkChoice(
    provider,
    {
      accounts: (accounts ?? []).map((a) => a.id),
      pages: (details.pageChoices ?? []).map((p) => p.id),
    },
    picked,
  );
  if (wrong) throw new PlatformError('invalid', wrong);
  if (provider === 'meta') {
    const pending = openSecrets<PendingMeta>(config.secretKey, row.secrets);
    const account = (accounts ?? []).find((a) => a.id === picked.accountId);
    const page = (details.pageChoices ?? []).find((p) => p.id === picked.pageId);
    const pageKeep = pending.pages?.[picked.pageId ?? ''];
    const accountKeep = pending.accounts?.[picked.accountId];
    if (!account || !page || !pageKeep || !accountKeep)
      throw new PlatformError('invalid', 'Open Connect again to pick.');
    return finishMeta(deps, {
      userId,
      userToken: pending.userToken,
      expiresAt: row.tokenExpiresAt,
      missing: row.missing,
      adAccount: { ...plain(account), ...accountKeep },
      page: {
        ...plain(page),
        pageToken: pageKeep.token,
        instagramId: pageKeep.instagramId,
        instagramUsername: pageKeep.instagramUsername,
      },
    });
  }
  const pending = openSecrets<PendingGoogle>(config.secretKey, row.secrets);
  const account = (accounts ?? []).find((a) => a.id === picked.accountId);
  const keep = pending.customers?.[picked.accountId];
  if (!account || !keep) throw new PlatformError('invalid', 'Open Connect again to pick.');
  return finishGoogle(deps, {
    userId,
    refreshToken: pending.refreshToken,
    customer: { ...plain(account), ...keep },
    inReview: pending.inReview,
  });
}

/** Turns a connection off: tokens go, the account names stay for history, campaigns stay. */
export async function disconnect(
  deps: FlowDeps,
  provider: AdProvider,
  userId: string,
): Promise<void> {
  await saveConnection(deps.db, deps.config.secretKey, provider, {
    status: 'disconnected',
    secrets: null,
    details:
      provider === 'meta' ? { adAccountChoices: [], pageChoices: [] } : { customerChoices: [] },
    missing: [],
    tokenExpiresAt: null,
    lastError: null,
    balancePaise: null,
  });
  await audit(deps, userId, 'marketing.disconnect', provider);
}

/** Keeps the failure words on the connection; a working connection stays as it is. */
export async function saveFailure(
  deps: FlowDeps,
  provider: AdProvider,
  words: string,
): Promise<void> {
  const row = await readConnection(deps.db, provider);
  await saveConnection(deps.db, deps.config.secretKey, provider, {
    status: row?.status ?? 'disconnected',
    lastError: words,
  });
}
