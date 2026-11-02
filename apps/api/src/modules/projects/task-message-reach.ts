import { customerContacts, type DatabaseExecutor, documents } from '@oneohm/database';
import { readTaskAttachment } from '@oneohm/domain';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { environmentOnce } from '../../config/environment-once';
import { sharedFileUrl } from '../whatsapp/file-links';

/**
 * Who a task's customer message goes to (PRD 6.2 "recipient"): the customer's own number,
 * and with `customer_and_family`, each family member who still has app access.
 */
export async function messagePhones(
  db: DatabaseExecutor,
  customer: { readonly id: string; readonly phone: string; readonly name: string },
  recipients: string | null | undefined,
): Promise<{ readonly phone: string; readonly name: string }[]> {
  const own = { phone: customer.phone, name: customer.name };
  if (recipients !== 'customer_and_family') return [own];
  const family = await db
    .select({ phone: customerContacts.phoneE164, name: customerContacts.name })
    .from(customerContacts)
    .where(and(eq(customerContacts.customerId, customer.id), isNull(customerContacts.revokedAt)));
  return [own, ...family.filter((member) => member.phone !== customer.phone)];
}

/**
 * The signed link a task's message carries (PRD 6.2 "attachments or report links"): the
 * project's report, or its newest paper in the chosen folder. Null when there is none,
 * so the message goes without a link rather than not at all.
 */
export async function attachmentLink(
  db: DatabaseExecutor,
  attachment: string | null | undefined,
  project: { readonly id: string; readonly customerId: string },
): Promise<string | null> {
  const chosen = readTaskAttachment(attachment);
  if (!chosen) return null;
  const env = environmentOnce();
  if (chosen.kind === 'report')
    return sharedFileUrl(env, {
      kind: 'report',
      id: project.id,
      key: chosen.key,
      customerId: project.customerId,
    });
  const [paper] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.projectId, project.id), eq(documents.category, chosen.category)))
    .orderBy(desc(documents.createdAt))
    .limit(1);
  if (!paper) return null;
  return sharedFileUrl(env, { kind: 'document', id: paper.id, customerId: project.customerId });
}
