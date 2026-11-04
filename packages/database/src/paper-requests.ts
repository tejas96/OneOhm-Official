import { and, count, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { homeName } from './customer-homes';
import { queueCustomerMessage } from './customer-message';
import { SOME_HOME } from './customer-message-words';
import { properties } from './schema/crm.schema';
import { messageTemplates } from './schema/message-templates.schema';
import { projects } from './schema/projects.schema';
import { auditLog } from './schema/records.schema';

// What the API and the worker both say about a paper the team asked for (papers per home).

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

/** The paper a customer is asked for: who, what, and for which project (if any). */
export interface AskedPaper {
  readonly projectId: string | null;
  readonly projectCode: string | null;
  readonly title: string;
  readonly customer: string;
  readonly phone: string;
}

/**
 * Asks the customer for the paper: `paper_request` naming the home once it is switched
 * on, else `document_requested`; app inbox and SMS say the same. The request and its
 * reminders all go through here, each with its own key.
 */
export async function askForPaper(
  db: DatabaseExecutor,
  asked: AskedPaper,
  dedupeKey: string,
  /** Already read by a caller that asks many at once. */
  chosen?: 'paper_request' | 'document_requested',
) {
  const template = chosen ?? (await paperRequestTemplate(db));
  const home = await homeNameOf(db, asked.projectId);
  return queueCustomerMessage(
    db,
    asked.phone,
    template,
    {
      customer: asked.customer,
      document: asked.title,
      // WhatsApp's document_requested needs a project: plain words when there is none.
      project: asked.projectCode ?? home,
      home,
    },
    dedupeKey,
  );
}
