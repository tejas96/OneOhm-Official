import type { DocumentCategory } from './document-categories';

/**
 * Papers that belong to the person and serve every home: ID and income proof. Every other
 * paper belongs to one home (its bill, its roof, its photos, its subsidy and loan papers).
 */
export const PERSON_DOCUMENT_CATEGORIES = [
  'customer_kyc',
  'income_proof',
] as const satisfies readonly DocumentCategory[];

export const isPersonDocumentCategory = (category: string): boolean =>
  (PERSON_DOCUMENT_CATEGORIES as readonly string[]).includes(category);

export const isSiteDocumentCategory = (category: string): boolean =>
  !isPersonDocumentCategory(category);

/** Where a paper (or a request for one) was filed. */
export interface FiledFor {
  readonly category: string;
  readonly propertyId?: string | null;
  readonly projectId: string | null;
}

/** The site a checklist or request is for, and how many sites the customer has. */
export interface SiteScope {
  readonly propertyId: string;
  readonly projectId: string | null;
  readonly customerSites: number;
}

/**
 * Whether a paper counts for this site. Customer papers count everywhere. A site paper
 * counts on its own site or project; one filed with neither counts only when the
 * customer has a single site, so it cannot be mistaken for another site's.
 */
export function countsForSite(paper: FiledFor, site: SiteScope): boolean {
  if (!isSiteDocumentCategory(paper.category)) return true;
  if (site.projectId && paper.projectId === site.projectId) return true;
  if (paper.propertyId) return paper.propertyId === site.propertyId;
  if (paper.projectId) return false;
  return site.customerSites <= 1;
}
