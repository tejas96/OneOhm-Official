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
  /** A contractor's papers and work orders; never shown to customers (rates are internal). */
  'contractor',
  /** A panel maker's certificate that the cells are made in India (goods receipt). */
  'dcr_certificate',
  'bank_loan',
  'discom',
  'subsidy',
  /** Proof of a low-income household (ration card, income certificate) for the state top-up. */
  'income_proof',
  'commissioning_handover',
  'warranty',
  /** Makers' user manuals for the panels, inverter and battery (PRD 5.4). */
  'product_manual',
  'statutory_report',
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/**
 * Files that are a task's evidence rather than a project paper: the customer's
 * sign-off drawn on the phone (PRD 3.17) and voice notes recorded at the site (PRD 4.2).
 * Kept apart from the library's folders, which file anything outside
 * `DOCUMENT_CATEGORIES` under Other; neither is shown in the customer app.
 */
export const TASK_EVIDENCE_CATEGORIES = ['customer_signature', 'voice_note'] as const;
export type TaskEvidenceCategory = (typeof TASK_EVIDENCE_CATEGORIES)[number];
export const SIGNATURE_CATEGORY: TaskEvidenceCategory = 'customer_signature';
export const VOICE_NOTE_CATEGORY: TaskEvidenceCategory = 'voice_note';

/** Images printed on every quotation and report (Settings → Company). */
export const COMPANY_ASSET_KINDS = ['logo', 'signature', 'stamp'] as const;
export type CompanyAssetKind = (typeof COMPANY_ASSET_KINDS)[number];

/** Company assets are stored as documents under these categories, never listed with project files. */
export const companyAssetCategory = (kind: CompanyAssetKind) => `company_${kind}` as const;

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}
