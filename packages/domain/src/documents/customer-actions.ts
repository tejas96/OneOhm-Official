import type { DocumentCategory } from './document-categories';
import type { DocumentRequirement } from './required-documents';

/** What the team can ask a customer to do (redesign §2). Only `paper` has a flow so far. */
export const CUSTOMER_ACTION_TYPES = [
  'paper',
  'location',
  'self_survey',
  'visit_pick',
  'presence',
  'signature',
  'pay',
  'confirm',
  'rating',
  'payout',
  'callback',
] as const;
export type CustomerActionType = (typeof CUSTOMER_ACTION_TYPES)[number];

/**
 * `open` waits on the customer, `received` waits for the team's check, `closed` is done.
 * A type without a check goes open → closed.
 */
export const CUSTOMER_ACTION_STATUSES = ['open', 'received', 'closed', 'cancelled'] as const;
export type CustomerActionStatus = (typeof CUSTOMER_ACTION_STATUSES)[number];

/** The types whose answer the team looks at before it is done. */
const CHECKED_TYPES: readonly CustomerActionType[] = ['paper'];

/** What happens to an action: the customer does it, staff file it, check it, ask again or cancel. */
export type CustomerActionEvent =
  | 'customer_did_it'
  | 'staff_did_it'
  | 'looks_good'
  | 'ask_again'
  | 'cancel';

/**
 * The status an action moves to, or null when the event does not fit where it is. A
 * paper the customer sends waits for the check; one staff file is checked on upload.
 */
export function nextActionStatus(
  type: CustomerActionType,
  status: CustomerActionStatus,
  event: CustomerActionEvent,
): CustomerActionStatus | null {
  const checked = CHECKED_TYPES.includes(type);
  switch (event) {
    case 'customer_did_it':
      return status === 'open' ? (checked ? 'received' : 'closed') : null;
    case 'staff_did_it':
      return status === 'open' ? 'closed' : null;
    case 'looks_good':
      return checked && status === 'received' ? 'closed' : null;
    case 'ask_again':
      return checked && (status === 'received' || status === 'closed') ? 'open' : null;
    case 'cancel':
      return status === 'open' ? 'cancelled' : null;
  }
}

/** What identifies an ask of a paper: its checklist item, else the kind (older rows). */
export interface PaperAsk {
  readonly requirementKey: string | null;
  readonly category: string | null;
}

/**
 * The key a free ask carries (the web sheet sends it): its kind and words, so Aadhaar and
 * PAN (both ID papers) can be asked together but Aadhaar not twice. A checklist row's own key
 * wins. A caller that sends no key is compared by kind (older rows).
 */
export function askKeyOf(ask: {
  readonly requirementKey?: string | null | undefined;
  readonly category: string;
  readonly title: string;
}): string {
  if (ask.requirementKey) return ask.requirementKey;
  const words = ask.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return `free:${ask.category}:${words}`;
}

/** Whether two asks are for the same paper: same key, or the same kind when either has no key. */
export function sameAsk(a: PaperAsk, b: PaperAsk): boolean {
  if (a.requirementKey && b.requirementKey) return a.requirementKey === b.requirementKey;
  return a.category !== null && a.category === b.category;
}

/**
 * Papers only the customer holds. The team never asks a customer for internal files such
 * as surveys, vendor papers or statutory reports, which OneOhm makes itself.
 */
export const CUSTOMER_REQUESTABLE_CATEGORIES = [
  'customer_kyc',
  'electricity_bill',
  'property',
  'bank_loan',
  'discom',
  'subsidy',
  'income_proof',
  'other',
] as const satisfies readonly DocumentCategory[];
export type CustomerRequestableCategory = (typeof CUSTOMER_REQUESTABLE_CATEGORIES)[number];

export function isCustomerRequestable(category: string): category is CustomerRequestableCategory {
  return (CUSTOMER_REQUESTABLE_CATEGORIES as readonly string[]).includes(category);
}

/** Longest request title the customer sees on WhatsApp and in the app. */
export const DOCUMENT_REQUEST_TITLE_MAX = 80;

/**
 * The category to ask the customer for, when a missing checklist paper is one the
 * customer holds; null when OneOhm makes it (survey, quotation, reports).
 */
export function customerCategoryFor(
  requirement: Pick<DocumentRequirement, 'categories' | 'fromCustomer'>,
): CustomerRequestableCategory | null {
  if (!requirement.fromCustomer) return null;
  return requirement.categories.find(askableFolder) ?? null;
}

const askableFolder = (category: string): category is CustomerRequestableCategory =>
  category !== 'other' && isCustomerRequestable(category);

/**
 * Whether "the customer provides it" can do anything for a paper filed in these folders:
 * the team can only ask the customer for a paper in a folder the customer holds, and never
 * for the catch-all Other folder.
 */
export function canAskCustomerFor(categories: readonly string[]): boolean {
  return categories.some(askableFolder);
}
