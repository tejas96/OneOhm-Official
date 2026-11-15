import type { ConversionEvent } from '@oneohm/domain';
import { GOOGLE_CONVERSION } from '@oneohm/domain';
import type { AccountChoice, GoogleAppConfig } from '../access';
import { PlatformError } from '../errors';
import { createGoogleAds, type GoogleAdsClient, googleTokenRequest } from './google-ads-http';
import { isDeveloperTokenError } from './google-errors';

/** The Google sign-in page (Google Ads scope, offline so we get a refresh token). */
export function googleLoginUrl(
  app: GoogleAppConfig,
  options: { readonly redirectUri: string; readonly state: string },
): string {
  const query = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: options.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

/** Swaps the sign-in code for a refresh token. */
export async function googleExchangeCode(
  app: GoogleAppConfig,
  code: string,
  redirectUri: string,
): Promise<{ readonly refreshToken: string }> {
  const body = await googleTokenRequest(app, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  if (!body?.refresh_token) {
    throw new PlatformError(
      'auth',
      'Google did not let us stay connected. Connect Google again and accept every question.',
      'no refresh_token in the token answer',
    );
  }
  return { refreshToken: String(body.refresh_token) };
}

export interface GoogleCustomerChoice extends AccountChoice {
  readonly currency: string;
  /** The manager account to call through, when the login reaches it via one. */
  readonly loginCustomerId: string | null;
}

const note = (currency: string, test: boolean) => (test ? `${currency} · test account` : currency);
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const CUSTOMER_QUERY =
  'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.test_account FROM customer LIMIT 1';
const CLIENTS_QUERY =
  'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager FROM customer_client WHERE customer_client.level <= 1';

/** The accounts one accessible customer stands for: itself, or the clients of a manager. */
async function choicesFor(
  app: GoogleAppConfig,
  refreshToken: string,
  id: string,
): Promise<GoogleCustomerChoice[]> {
  const direct = createGoogleAds(app, { refreshToken, loginCustomerId: null });
  const [row] = await direct.search(id, CUSTOMER_QUERY);
  const customer = row?.customer;
  if (!customer) return [];
  const currency = String(customer.currencyCode ?? 'INR');
  if (!customer.manager) {
    return [
      {
        id,
        name: customer.descriptiveName || `Account ${id}`,
        note: note(currency, Boolean(customer.testAccount)),
        currency,
        loginCustomerId: null,
      },
    ];
  }
  const through = createGoogleAds(app, { refreshToken, loginCustomerId: id });
  const clients = await through.search(id, CLIENTS_QUERY);
  const choices: GoogleCustomerChoice[] = [];
  for (const entry of clients) {
    const client = entry.customerClient;
    const clientId = digits(client?.id);
    if (!clientId || client.manager) continue;
    const clientCurrency = String(client.currencyCode ?? 'INR');
    choices.push({
      id: clientId,
      name: client.descriptiveName || `Account ${clientId}`,
      note: note(clientCurrency, false),
      currency: clientCurrency,
      loginCustomerId: id,
    });
  }
  return choices;
}

/** Errors that only mean "this one account is not usable" are skipped; the rest stop us. */
const skippable = (error: unknown) =>
  error instanceof PlatformError && !['auth', 'rate', 'temporary'].includes(error.kind);

/**
 * The Google Ads accounts the login reaches. `inReview` is true while Google still has the
 * developer token at test level (it cannot touch real accounts yet).
 */
export async function googleDiscover(
  app: GoogleAppConfig,
  refreshToken: string,
): Promise<{ readonly customers: readonly GoogleCustomerChoice[]; readonly inReview: boolean }> {
  const direct = createGoogleAds(app, { refreshToken, loginCustomerId: null });
  let names: string[];
  try {
    names = ((await direct.get('customers:listAccessibleCustomers')).resourceNames ??
      []) as string[];
  } catch (error) {
    if (isDeveloperTokenError(error)) return { customers: [], inReview: true };
    throw error;
  }
  const found = new Map<string, GoogleCustomerChoice>();
  let inReview = false;
  for (const name of names) {
    try {
      for (const choice of await choicesFor(app, refreshToken, digits(name))) {
        if (!found.has(choice.id)) found.set(choice.id, choice);
      }
    } catch (error) {
      if (isDeveloperTokenError(error)) inReview = true;
      else if (!skippable(error)) throw error;
    }
  }
  return { customers: [...found.values()], inReview };
}

/** Makes (or finds) one upload conversion action per sale step. */
export async function googlePrepare(
  app: GoogleAppConfig,
  access: {
    readonly refreshToken: string;
    readonly customerId: string;
    readonly loginCustomerId: string | null;
  },
): Promise<{
  readonly conversionActions: Partial<Record<ConversionEvent, string>>;
  /** Customer data terms accepted and enhanced conversions for leads on: hashes may go along. */
  readonly enhancedConversionsForLeads: boolean;
}> {
  const client = createGoogleAds(app, access);
  const conversionActions: Partial<Record<ConversionEvent, string>> = {};
  for (const [step, action] of Object.entries(GOOGLE_CONVERSION) as [
    ConversionEvent,
    (typeof GOOGLE_CONVERSION)[ConversionEvent],
  ][]) {
    const name = action.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const [existing] = await client.search(
      access.customerId,
      `SELECT conversion_action.resource_name FROM conversion_action WHERE conversion_action.name = '${name}' AND conversion_action.status != 'REMOVED'`,
    );
    let resourceName: string | undefined = existing?.conversionAction?.resourceName;
    if (!resourceName) {
      const made = await client.mutate(access.customerId, 'conversionActions:mutate', {
        operations: [
          {
            create: {
              name: action.name,
              type: 'UPLOAD_CLICKS',
              category: action.category,
              status: 'ENABLED',
              countingType: 'ONE_PER_CLICK',
              valueSettings: {
                defaultValue: 0,
                defaultCurrencyCode: 'INR',
                alwaysUseDefaultValue: false,
              },
            },
          },
        ],
      });
      resourceName = made.results?.[0]?.resourceName;
    }
    if (resourceName) conversionActions[step] = resourceName;
  }
  return {
    conversionActions,
    enhancedConversionsForLeads: await readEnhanced(client, access.customerId),
  };
}

/** Whether the account accepted the data terms and turned on enhanced conversions for leads. */
async function readEnhanced(client: GoogleAdsClient, customerId: string): Promise<boolean> {
  try {
    const [row] = await client.search(
      customerId,
      'SELECT customer.conversion_tracking_setting.accepted_customer_data_terms, customer.conversion_tracking_setting.enhanced_conversions_for_leads_enabled FROM customer',
    );
    const setting = row?.customer?.conversionTrackingSetting;
    return (
      setting?.acceptedCustomerDataTerms === true &&
      setting?.enhancedConversionsForLeadsEnabled === true
    );
  } catch (error) {
    if (error instanceof PlatformError && (error.kind === 'auth' || error.retryable)) throw error;
    return false;
  }
}
