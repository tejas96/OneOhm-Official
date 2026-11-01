/**
 * Where a document belongs (PRD 3.14). Fixed in code so filters, checklists and the
 * customer app agree; each upload picks one.
 */
export const DOCUMENT_CATEGORIES = [
  'site_photo',
  'site_survey',
  'customer_kyc',
  'electricity_bill',
  'property',
  'quotation',
  'invoice_receipt',
  'vendor',
  'bank_loan',
  'discom',
  'subsidy',
  'commissioning_handover',
  'warranty',
  'statutory_report',
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/**
 * Files that are a task's evidence rather than a project paper: the customer's
 * sign-off drawn on the phone (PRD 3.17). Kept apart from the library's folders, which
 * file anything outside `DOCUMENT_CATEGORIES` under Other.
 */
export const TASK_EVIDENCE_CATEGORIES = ['customer_signature'] as const;
export type TaskEvidenceCategory = (typeof TASK_EVIDENCE_CATEGORIES)[number];
export const SIGNATURE_CATEGORY: TaskEvidenceCategory = 'customer_signature';

/** Images printed on every quotation and report (Settings → Company). */
export const COMPANY_ASSET_KINDS = ['logo', 'signature', 'stamp'] as const;
export type CompanyAssetKind = (typeof COMPANY_ASSET_KINDS)[number];

/** Company assets are stored as documents under these categories, never listed with project files. */
export const companyAssetCategory = (kind: CompanyAssetKind) => `company_${kind}` as const;

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}
