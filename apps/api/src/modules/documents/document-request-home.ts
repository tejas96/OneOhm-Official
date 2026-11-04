import {
  auditLog,
  type DatabaseExecutor,
  messageTemplates,
  projects,
  properties,
  SOME_HOME,
} from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import { and, count, eq } from 'drizzle-orm';
import { customerHomes, homeName } from '../customer-portal/customer-homes';
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

/** The request template: `paper_request` (names the home) once it is switched on. */
export async function paperRequestTemplate(
  db: DatabaseExecutor,
): Promise<'paper_request' | 'document_requested'> {
  const [row] = await db
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'paper_request'))
    .limit(1);
  return row?.active ? 'paper_request' : 'document_requested';
}

/**
 * How a message names the project's home: its site label, else its town, with the end of
 * its consumer number when another home of the customer has the same name. SOME_HOME
 * (said in the customer's language) when there is no project.
 */
export async function homeNameOf(db: DatabaseExecutor, projectId: string | null) {
  const [project] = projectId
    ? await db
        .select({ propertyId: projects.propertyId, customerId: projects.customerId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    : [];
  if (!project) return SOME_HOME;
  const homes = await db
    .select({
      propertyId: properties.id,
      label: properties.label,
      city: properties.city,
      consumerNumber: properties.consumerNumber,
    })
    .from(properties)
    .where(eq(properties.customerId, project.customerId));
  const home = homes.find((one) => one.propertyId === project.propertyId);
  return home ? homeName(home, homes) : SOME_HOME;
}

/**
 * How many times the team asked again for this request. Keys of messages and alerts that
 * follow an "ask again" carry it, so the next answer is told, not taken for the first.
 */
export async function reaskCount(db: DatabaseExecutor, requestId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, 'document_request'),
        eq(auditLog.entityId, requestId),
        eq(auditLog.action, 'document_request.reasked'),
      ),
    );
  return row?.n ?? 0;
}

/** The dedupe key of one round of a request: `base`, then `base:reask:<n>` after asking again. */
export const roundKey = (base: string, reasks: number) =>
  reasks > 0 ? `${base}:reask:${reasks}` : base;
