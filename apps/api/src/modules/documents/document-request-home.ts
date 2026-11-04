import { type DatabaseExecutor } from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import { customerHomes } from '../customer-portal/customer-homes';
import { papersForHome } from '../whatsapp/assistant/paper-match';
import { openPapersOf } from '../whatsapp/assistant/paper-reads';

/**
 * The customer's open requests for this kind of paper on this home, oldest first: the
 * same rule the WhatsApp assistant answers by (an ID or income paper is the person's, any
 * other is its home's). A paper with no home counts for a customer's only home.
 */
export async function openRequestsFor(
  db: DatabaseExecutor,
  customerId: string,
  paper: { readonly category: string; readonly propertyId: string | null },
) {
  const homes = await customerHomes(db, customerId);
  const propertyId = isPersonDocumentCategory(paper.category)
    ? 'person'
    : (paper.propertyId ?? (homes.length === 1 ? homes[0]?.propertyId : undefined));
  if (!propertyId) return [];
  const open = await openPapersOf(db, customerId);
  return papersForHome(open, { propertyId }, homes.length).filter(
    (request) => request.category === paper.category,
  );
}

// Shared with the worker, which reminds by the same words and keys.
export { homeNameOf, paperRequestTemplate, reaskCount, roundKey } from '@oneohm/database';
