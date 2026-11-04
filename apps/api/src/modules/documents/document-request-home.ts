import { customerActions, type DatabaseExecutor, projects } from '@oneohm/database';
import { isPersonDocumentCategory, sameAsk } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { customerHomes } from '../customer-portal/customer-homes';
import { papersForHome } from '../whatsapp/assistant/paper-match';
import { openPapersOf } from '../whatsapp/assistant/paper-reads';

/** The home a request is on: its project's, else the one it was asked on (a lead's site). */
export async function homeOfRequest(db: DatabaseExecutor, id: string): Promise<string | null> {
  const [row] = await db
    .select({ own: customerActions.propertyId, project: projects.propertyId })
    .from(customerActions)
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .where(eq(customerActions.id, id));
  return row?.project ?? row?.own ?? null;
}

/**
 * The customer's open requests for this paper on this home, oldest first: the same rule
 * the WhatsApp assistant answers by (an ID or income paper is the person's, any other is
 * its home's). A paper with no home counts for a customer's only home. The same paper is
 * the same checklist item (`requirementKey`), or the same kind when either has no key.
 */
export async function openRequestsFor(
  db: DatabaseExecutor,
  customerId: string,
  paper: {
    readonly category: string;
    readonly propertyId: string | null;
    readonly requirementKey?: string | null;
  },
) {
  const homes = await customerHomes(db, customerId);
  const propertyId = isPersonDocumentCategory(paper.category)
    ? 'person'
    : (paper.propertyId ?? (homes.length === 1 ? homes[0]?.propertyId : undefined));
  if (!propertyId) return [];
  const open = await openPapersOf(db, customerId);
  return papersForHome(open, { propertyId }, homes.length).filter((request) =>
    sameAsk(
      { requirementKey: paper.requirementKey ?? null, category: paper.category },
      { requirementKey: request.requirementKey ?? null, category: request.category },
    ),
  );
}

// Shared with the worker, which reminds by the same words and keys.
export { homeNameOf, paperRequestTemplate, reaskCount, roundKey } from '@oneohm/database';
