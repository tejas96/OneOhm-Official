import type { DocumentCategory } from './document-categories';

/**
 * Folders a homeowner sees in the app and can be sent links to (PRD 5.4). Internal
 * files (vendor papers, panel certificates, working photos) stay with the team.
 */
export const CUSTOMER_DOCUMENT_CATEGORIES = [
  'site_survey',
  'customer_kyc',
  'electricity_bill',
  'property',
  'quotation',
  'invoice_receipt',
  'bank_loan',
  'discom',
  'subsidy',
  'income_proof',
  'commissioning_handover',
  'warranty',
  'product_manual',
  'statutory_report',
  'other',
] as const satisfies readonly DocumentCategory[];

export type CustomerDocumentCategory = (typeof CUSTOMER_DOCUMENT_CATEGORIES)[number];

export const isCustomerDocumentCategory = (value: string): value is CustomerDocumentCategory =>
  (CUSTOMER_DOCUMENT_CATEGORIES as readonly string[]).includes(value);
