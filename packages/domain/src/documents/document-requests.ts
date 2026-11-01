import type { DocumentCategory } from './document-categories';
import type { DocumentRequirement } from './required-documents';

/** A paper the team asked the customer for (PRD 5.4, 6.1). */
export const DOCUMENT_REQUEST_STATUSES = ['open', 'received', 'cancelled'] as const;
export type DocumentRequestStatus = (typeof DOCUMENT_REQUEST_STATUSES)[number];

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
  for (const category of requirement.categories) {
    if (category !== 'other' && isCustomerRequestable(category)) return category;
  }
  return null;
}
