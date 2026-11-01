import type { SubsidyCategory } from '../subsidy/subsidy-rules';

/**
 * What a completed property type change means for the site's projects and quotes
 * (PRD 3.15 "Project impact"): a commercial connection gets no subsidy, so the project's
 * subsidy is removed; a change never turns subsidy on by itself (that needs a re-priced,
 * accepted quote). Open quotations priced for another type are flagged for re-pricing.
 */
export function subsidyAfterTypeChange(current: boolean, newCategory: SubsidyCategory): boolean {
  return current && newCategory !== 'commercial';
}

type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'superseded';

/** True while a quotation can still change hands and was priced for another site type. */
export function needsRepricing(
  quotation: { readonly status: QuotationStatus; readonly subsidyCategory: SubsidyCategory },
  siteCategory: SubsidyCategory,
): boolean {
  const open = quotation.status === 'draft' || quotation.status === 'sent';
  return open && quotation.subsidyCategory !== siteCategory;
}

/**
 * A subsidy-only task (its template applies only to subsidy projects) that nobody has
 * started: when the subsidy is removed it is no longer needed and can come off the
 * project. Work already begun stays for a person to close.
 */
export function droppedWithSubsidy(task: {
  readonly conditions: { readonly subsidy?: boolean } | null;
  readonly status: string;
  readonly startedAt: Date | string | null;
}): boolean {
  const untouched = (task.status === 'pending' || task.status === 'ready') && !task.startedAt;
  return task.conditions?.subsidy === true && untouched;
}
