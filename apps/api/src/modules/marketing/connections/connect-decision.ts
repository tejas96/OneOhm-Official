import type { GoogleCustomerChoice, MetaAdAccountChoice, MetaPageChoice } from '@oneohm/marketing';
import { GOOGLE_WAITING, needsReview } from './connection-words';

export const PICK_WORDS = 'Pick your ad account and page.';
export const META_REVIEW_WORDS = 'Meta is reviewing your ad account';

export const RUPEE_WORDS = 'OneOhm runs ads in rupees. Pick an ad account set to INR.';

/** The plain words when an account is not in rupees; null when it is. */
export const currencyProblem = (currency: string | null | undefined): string | null =>
  currency && currency.toUpperCase() !== 'INR' ? RUPEE_WORDS : null;

export type ConnectStatus = 'connected' | 'in_review';

export type MetaDecision =
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'pick';
      readonly adAccount: MetaAdAccountChoice;
      readonly page: MetaPageChoice;
    }
  | { readonly kind: 'choose' };

/** One ad account and one page are picked for the person; any other count is their choice. */
export function decideMeta(found: {
  readonly adAccounts: readonly MetaAdAccountChoice[];
  readonly pages: readonly MetaPageChoice[];
}): MetaDecision {
  const [adAccount, otherAccount] = found.adAccounts;
  const [page, otherPage] = found.pages;
  if (!adAccount)
    return {
      kind: 'error',
      message:
        'We could not find an ad account on this Meta login. Make one in Meta Business Suite, then connect again.',
    };
  if (!page)
    return {
      kind: 'error',
      message:
        'We could not find a Facebook page on this Meta login. Make or share a page with this login, then connect again.',
    };
  if (otherAccount || otherPage) return { kind: 'choose' };
  return { kind: 'pick', adAccount, page };
}

/** Connected, or in review while Meta still holds back a permission or the ad account. */
export function metaOutcome(
  missing: readonly string[],
  accountStatus: number,
): { readonly status: ConnectStatus; readonly lastError: string | null } {
  if (accountStatus === 7 || accountStatus === 8)
    return { status: 'in_review', lastError: META_REVIEW_WORDS };
  return { status: missing.some(needsReview) ? 'in_review' : 'connected', lastError: null };
}

export type GoogleDecision =
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'pick'; readonly customer: GoogleCustomerChoice }
  | { readonly kind: 'choose' };

export function decideGoogle(found: {
  readonly customers: readonly GoogleCustomerChoice[];
}): GoogleDecision {
  const [customer, other] = found.customers;
  if (!customer)
    return {
      kind: 'error',
      message:
        'We could not find a Google Ads account on this Google login. Make one at ads.google.com, then connect again.',
    };
  return other ? { kind: 'choose' } : { kind: 'pick', customer };
}

export function googleOutcome(inReview: boolean): {
  readonly status: ConnectStatus;
  readonly missing: readonly string[];
} {
  return inReview
    ? { status: 'in_review', missing: [GOOGLE_WAITING] }
    : { status: 'connected', missing: [] };
}

/** Whether the picked ids are among the ones we offered. Returns the plain words when not. */
export function checkChoice(
  provider: 'meta' | 'google',
  offered: { readonly accounts: readonly string[]; readonly pages: readonly string[] },
  picked: { readonly accountId: string; readonly pageId?: string | undefined },
): string | null {
  if (!offered.accounts.includes(picked.accountId))
    return 'That account is not on your list. Open Connect again.';
  if (provider === 'meta') {
    if (!picked.pageId) return 'Pick a page too.';
    if (!offered.pages.includes(picked.pageId))
      return 'That page is not on your list. Open Connect again.';
  }
  return null;
}
