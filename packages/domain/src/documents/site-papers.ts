import type { DocumentCategory } from './document-categories';

/**
 * Papers that belong to one site, not to the person: each connection has its own bill,
 * each roof its own proof. ID papers stay with the customer and serve every site.
 */
export const SITE_DOCUMENT_CATEGORIES = [
  'electricity_bill',
  'property',
] as const satisfies readonly DocumentCategory[];

export const isSiteDocumentCategory = (category: string): boolean =>
  (SITE_DOCUMENT_CATEGORIES as readonly string[]).includes(category);

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
