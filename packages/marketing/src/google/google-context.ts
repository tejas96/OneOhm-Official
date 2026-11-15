import type { GoogleAccess, GoogleAppConfig } from '../access';
import type { GoogleAdsClient } from './google-ads-http';

/** What every Google call needs: the client, the connection and the app. */
export interface GoogleContext {
  readonly client: GoogleAdsClient;
  readonly access: GoogleAccess;
  readonly app: GoogleAppConfig;
}

/** The digits at the end of a resource name (or the digits given). */
export const lastId = (value: string): string => value.split('/').pop() ?? value;

/** `customers/<id>/campaigns/<n>` from a full name or just the number. */
export const campaignResource = (ctx: GoogleContext, value: string): string =>
  value.includes('/') ? value : `customers/${ctx.access.customerId}/campaigns/${value}`;

/** A value safe inside a GAQL string. */
export const gaqlText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Plain words when the account bills in another currency: budgets here are in rupees. */
export const NOT_RUPEES =
  'This Google Ads account is not in rupees (INR). Pick an account set to INR.';

/** True when the connected account bills in rupees. */
export const isRupees = (ctx: GoogleContext): boolean =>
  ctx.access.currency.toUpperCase() === 'INR';
