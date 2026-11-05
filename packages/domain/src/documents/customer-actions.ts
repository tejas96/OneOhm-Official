import type { DocumentCategory } from './document-categories';
import type { DocumentRequirement } from './required-documents';

/** What the team can ask a customer to do (redesign §2). `paper`, `location`, `pay` and `callback` have flows so far. */
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

/** The types whose answer the team always looks at before it is done. */
const CHECKED_TYPES: readonly CustomerActionType[] = ['paper', 'visit_pick'];

/**
 * The types the team may check: a paper always; a location only when it conflicts with a point
 * the home already has (`needs_check`); a payment proof waits for finance to record it; a call-back
 * waits as "To call" once the customer picked a time, until staff say they called; a picked visit day
 * waits for the team to confirm it.
 */
const CHECKABLE_TYPES: readonly CustomerActionType[] = [
  'paper',
  'location',
  'pay',
  'callback',
  'visit_pick',
];

/** What happens to an action: the customer does it, staff file it, check it, ask again or cancel. */
export type CustomerActionEvent =
  | 'customer_did_it'
  /** The customer did it, but the answer needs the team's eyes (a pin on a located home, a proof). */
  | 'needs_check'
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
  const isOpen = status === 'open';
  const isReceived = status === 'received';
  const checked = CHECKED_TYPES.includes(type);
  const checkable = CHECKABLE_TYPES.includes(type);
  const next: Record<CustomerActionEvent, CustomerActionStatus | null> = {
    customer_did_it: isOpen ? (checked ? 'received' : 'closed') : null,
    needs_check: isOpen && checkable ? 'received' : null,
    staff_did_it: isOpen ? 'closed' : null,
    looks_good: isReceived && checkable ? 'closed' : null,
    ask_again: checked && (isReceived || status === 'closed') ? 'open' : null,
    cancel: isOpen ? 'cancelled' : null,
  };
  return next[event];
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
