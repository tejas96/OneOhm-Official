import type { DocumentRecord } from '@oneohm/api-contracts';

/** Where a file came from: uploaded by someone, made by OneOhm, or a statutory report. */
export type SourceFilter = 'all' | DocumentRecord['source'];

/** Search by date and by source or person (PRD 3.14), beside the name search. */
export interface MoreFilters {
  readonly source: SourceFilter;
  /** "all" or the id of the person who added the file. */
  readonly uploader: string;
  /** `YYYY-MM-DD`, or empty for no limit. */
  readonly from: string;
  readonly to: string;
}

export const NO_MORE_FILTERS: MoreFilters = { source: 'all', uploader: 'all', from: '', to: '' };

/** The day a file was added, in India, as `YYYY-MM-DD`. */
export function addedOn(document: Pick<DocumentRecord, 'createdAt'>): string {
  return new Date(document.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function matchesMore(document: DocumentRecord, filters: MoreFilters): boolean {
  if (filters.source !== 'all' && document.source !== filters.source) return false;
  if (filters.uploader !== 'all' && document.uploadedBy?.id !== filters.uploader) return false;
  if (!filters.from && !filters.to) return true;
  const day = addedOn(document);
  return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
}

export const hasMoreFilters = (filters: MoreFilters): boolean =>
  filters.source !== 'all' ||
  filters.uploader !== 'all' ||
  filters.from !== '' ||
  filters.to !== '';

/** Everyone who added a file here, by name. */
export function uploadersOf(
  documents: readonly DocumentRecord[],
): { readonly id: string; readonly fullName: string }[] {
  const people = new Map<string, string>();
  for (const document of documents) {
    if (document.uploadedBy) people.set(document.uploadedBy.id, document.uploadedBy.fullName);
  }
  return [...people.entries()]
    .map(([id, fullName]) => ({ id, fullName }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
}
