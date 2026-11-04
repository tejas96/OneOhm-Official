import { ACCEPTED_FILE_TYPES } from '@oneohm/domain';
import type { CustomerHome } from '../../customer-portal/customer-homes';
import type { PaperPlace } from '../file-paper';

/** A kept file: its document and its real type. */
export interface KeptFile {
  readonly id: string;
  readonly contentType: string;
}

/** A photo or PDF: the files an asked-for paper accepts. */
export const answersRequests = (contentType: string): boolean =>
  (ACCEPTED_FILE_TYPES as readonly string[]).includes(contentType);

/**
 * Where a file of a home goes: its project and property. A customer with no home at all
 * keeps the file under the customer (no place). `'person'` is an ID paper: no home.
 */
export function placeOn(
  homes: readonly CustomerHome[],
  propertyId: string | 'person',
  category: string,
): PaperPlace | null {
  if (propertyId === 'person') return { projectId: null, propertyId: null, category };
  const home = homes.find((each) => each.propertyId === propertyId);
  return home ? { projectId: home.projectId, propertyId: home.propertyId, category } : null;
}
