import type { UploadFields } from '@oneohm/api-contracts';
import { contractors, type DatabaseExecutor, documents, vendors } from '@oneohm/database';
import { eq, type SQL } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { forbidden, invalid, notFound } from '../../common/http/errors';
import { canUploadDocuments, canViewAllDocuments } from './document-access';

/** A contractor's or a vendor's own papers: agreement, licence, insurance, certificates. */
export interface PartyLinks {
  readonly contractorId: string | null;
  readonly vendorId: string | null;
}

type PartyFields = Pick<
  UploadFields,
  'contractorId' | 'vendorId' | 'projectId' | 'taskId' | 'customerId' | 'leadId'
>;

async function assertParty(db: DatabaseExecutor, links: PartyLinks): Promise<void> {
  if (links.contractorId) {
    const [row] = await db
      .select({ id: contractors.id })
      .from(contractors)
      .where(eq(contractors.id, links.contractorId))
      .limit(1);
    if (!row) throw notFound('That contractor');
  }
  if (links.vendorId) {
    const [row] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.id, links.vendorId))
      .limit(1);
    if (!row) throw notFound('That vendor');
  }
}

/**
 * Where a contractor's or vendor's paper goes (PRD 3.13, 3.14). It is the party's own
 * file, kept apart from customers and projects, and only the office adds one. Null when
 * the upload is not for a party.
 */
export async function partyUploadLinks(
  db: DatabaseExecutor,
  actor: Actor,
  fields: PartyFields,
): Promise<PartyLinks | null> {
  if (!fields.contractorId && !fields.vendorId) return null;
  if (fields.contractorId && fields.vendorId) {
    throw invalid('A paper belongs to one contractor or one vendor.', {
      vendorId: 'Choose one.',
    });
  }
  if (fields.projectId || fields.taskId || fields.customerId || fields.leadId) {
    throw invalid('A contractor’s or vendor’s paper is kept on them, not on a project.', {
      contractorId: 'Send it without a project, task, customer or lead.',
    });
  }
  if (!canUploadDocuments(actor)) throw forbidden();
  const links = { contractorId: fields.contractorId ?? null, vendorId: fields.vendorId ?? null };
  await assertParty(db, links);
  return links;
}

/** The files listed for a contractor or vendor; office staff who see every document only. */
export function partyFilesScope(
  actor: Actor,
  filter: { readonly contractorId?: string | undefined; readonly vendorId?: string | undefined },
): SQL | null {
  if (!filter.contractorId && !filter.vendorId) return null;
  if (!canViewAllDocuments(actor)) throw forbidden();
  return filter.contractorId
    ? eq(documents.contractorId, filter.contractorId)
    : eq(documents.vendorId, filter.vendorId as string);
}

/** Storage folder for a party's paper. */
export function partyScope(links: PartyLinks): string {
  return links.contractorId ? `contractors/${links.contractorId}` : `vendors/${links.vendorId}`;
}
