import type { UploadFields } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents, leads } from '@oneohm/database';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden, invalid, notFound } from '../../common/http/errors';
import { leadVisibility } from '../crm/lead-read';
import { canUploadDocuments, canViewAllDocuments } from './document-access';

interface LeadSite {
  readonly customerId: string | null;
  readonly propertyId: string | null;
}

/** The lead as the actor may see it (a reseller: only their own), with its customer and site. */
async function visibleLead(db: DatabaseExecutor, actor: Actor, leadId: string): Promise<LeadSite> {
  const [lead] = await db
    .select({ customerId: leads.customerId, propertyId: leads.propertyId })
    .from(leads)
    .where(and(eq(leads.id, leadId), leadVisibility(actor)))
    .limit(1);
  if (!lead) throw notFound('That lead');
  return lead;
}

type LinkFields = Pick<
  UploadFields,
  'leadId' | 'taskId' | 'projectId' | 'customerId' | 'propertyId'
>;

/**
 * A paper for a lead (PRD 4.5: electricity bill, ID proof) is kept on the lead's
 * customer and site, so it is there when the lead becomes a project. Working the lead
 * (`leads.manage`) is enough to add one, which lets a reseller do it for their own
 * leads only. Refused when the fields point elsewhere or the lead has no site yet.
 */
export async function leadUploadLinks(
  db: DatabaseExecutor,
  actor: Actor,
  leadId: string,
  fields: LinkFields,
): Promise<{ customerId: string; propertyId: string | undefined }> {
  if (fields.taskId || fields.projectId) {
    throw invalid('A lead’s paper is kept on the customer, not on a project.', {
      leadId: 'Send it without a project or task.',
    });
  }
  if (!can(actor, 'leads.manage') && !canUploadDocuments(actor)) throw forbidden();
  const lead = await visibleLead(db, actor, leadId);
  if (!lead.customerId) {
    throw invalid('Add the site to this lead first, then its papers.', {
      leadId: 'Add the site first.',
    });
  }
  const otherCustomer = fields.customerId && fields.customerId !== lead.customerId;
  const otherSite = fields.propertyId && fields.propertyId !== lead.propertyId;
  if (otherCustomer || otherSite) {
    throw invalid('That customer or site is not this lead’s.', { leadId: 'Wrong lead.' });
  }
  return { customerId: lead.customerId, propertyId: lead.propertyId ?? undefined };
}

/**
 * Which files a lead screen lists: the papers on the lead's customer outside any
 * project or task. Without `documents.view` (resellers), only the ones the person
 * added. Null when the lead has no customer yet (nothing to list).
 */
export async function leadFilesScope(
  db: DatabaseExecutor,
  actor: Actor,
  leadId: string,
): Promise<SQL | null> {
  const lead = await visibleLead(db, actor, leadId);
  if (!lead.customerId) return null;
  const conditions: SQL[] = [
    eq(documents.customerId, lead.customerId),
    isNull(documents.projectId),
    isNull(documents.taskId),
  ];
  if (!canViewAllDocuments(actor)) conditions.push(eq(documents.uploadedByUserId, actor.userId));
  return and(...conditions) ?? null;
}
