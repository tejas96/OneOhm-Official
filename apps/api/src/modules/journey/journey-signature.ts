import { randomUUID } from 'node:crypto';
import {
  customerActions,
  customers,
  type Database,
  type DatabaseExecutor,
  documents,
  projects,
  projectTasks,
} from '@oneohm/database';
import { SIGNATURE_CATEGORY } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { JOURNEY_WORDS } from './journey-words';

/** What the customer's "I agree" came to. */
export type Agreed =
  | { readonly kind: 'old' }
  /** Not the customer's own number (a family member): who may agree. */
  | { readonly kind: 'own'; readonly name: string }
  | { readonly kind: 'agreed'; readonly copyId: string };

/**
 * [I agree] (redesign §2.4, §4 Agreements): only the customer's own number agrees. The agreement is
 * logged with who, which number and when, and the signed copy is asked for as a paper of its own
 * (the existing paper flow: form or chat, then the team's Looks good / Ask again). Tapping again
 * changes nothing.
 */
export function agree(
  db: Database,
  chat: { readonly phone: string },
  customerId: string,
  actionId: string,
): Promise<Agreed> {
  return db.transaction((tx) => agreeIn(tx, chat, customerId, actionId));
}

async function agreeIn(
  db: DatabaseExecutor,
  chat: { readonly phone: string },
  customerId: string,
  actionId: string,
): Promise<Agreed> {
  const [row] = await db
    .select({ action: customerActions, phone: customers.phoneE164, name: customers.name })
    .from(customerActions)
    .innerJoin(customers, eq(customers.id, customerActions.customerId))
    .where(
      and(
        eq(customerActions.id, actionId),
        eq(customerActions.customerId, customerId),
        eq(customerActions.type, 'signature'),
        eq(customerActions.status, 'open'),
      ),
    )
    .for('update', { of: customerActions });
  if (!row) return { kind: 'old' };
  if (row.phone !== chat.phone) return { kind: 'own', name: row.name.split(/\s+/)[0] ?? row.name };
  const given = row.action.payload.signedActionId;
  if (typeof given === 'string') return { kind: 'agreed', copyId: given };
  const copyId = randomUUID();
  const at = new Date();
  const title = String(row.action.payload.paperTitle ?? row.action.title);
  await recordAgreement(db, row.action, { copyId, title, phone: chat.phone, name: row.name, at });
  return { kind: 'agreed', copyId };
}

async function recordAgreement(
  tx: DatabaseExecutor,
  action: typeof customerActions.$inferSelect,
  agreed: { copyId: string; title: string; phone: string; name: string; at: Date },
) {
  const [home] = action.projectId
    ? await tx
        .select({ propertyId: projects.propertyId })
        .from(projects)
        .where(eq(projects.id, action.projectId))
    : [];
  await tx.insert(customerActions).values({
    id: agreed.copyId,
    type: 'paper',
    customerId: action.customerId,
    projectId: action.projectId,
    propertyId: home?.propertyId ?? null,
    title: JOURNEY_WORDS.sign.signedTitle(agreed.title),
    category: 'other',
    payload: { signatureActionId: action.id },
    requestedByUserId: action.requestedByUserId,
  });
  await tx
    .update(customerActions)
    .set({
      payload: {
        ...action.payload,
        signedActionId: agreed.copyId,
        agreedAt: agreed.at.toISOString(),
        agreedByPhone: agreed.phone,
        agreedByName: agreed.name,
      },
      doneAt: agreed.at,
      note: `Agreed by ${agreed.name} (${agreed.phone}) on ${agreed.at.toISOString().slice(0, 16).replace('T', ' ')} UTC. Waiting for the signed copy.`,
      updatedAt: agreed.at,
    })
    .where(eq(customerActions.id, action.id));
  await logAction(tx, action, {
    kind: 'customer_action',
    message: `${agreed.name} agreed to ${agreed.title} on WhatsApp (${agreed.phone}, ${agreed.at.toISOString()}). The signed copy is asked for.`,
    userId: null,
    data: { customerActionId: action.id },
  });
  await recordAudit(tx, null, 'customer_action.signature_agreed', 'customer_action', action.id, {
    by: agreed.phone,
    at: agreed.at.toISOString(),
  });
}

/**
 * The team looked at the signed copy and it is fine: the signature ask closes (agreed + signed copy
 * checked) and, when the ask came from a task that needs the customer's signature, the copy becomes
 * that task's signature evidence.
 */
export async function signedCopyChecked(
  tx: DatabaseExecutor,
  signatureId: string,
  documentId: string | null,
  userId: string | null,
): Promise<void> {
  const now = new Date();
  const [closed] = await tx
    .update(customerActions)
    .set({ status: 'closed', documentId, closedAt: now, updatedAt: now })
    .where(and(eq(customerActions.id, signatureId), eq(customerActions.status, 'open')))
    .returning();
  if (!closed) return;
  await logAction(tx, closed, {
    kind: 'customer_action',
    message: `${closed.title}: agreed and the signed copy is checked`,
    userId,
    data: { customerActionId: closed.id, documentId },
  });
  await recordAudit(tx, userId, 'customer_action.signature_done', 'customer_action', closed.id, {
    documentId,
  });
  if (!closed.taskId || !documentId) return;
  const [task] = await tx
    .select({ evidence: projectTasks.evidence })
    .from(projectTasks)
    .where(eq(projectTasks.id, closed.taskId));
  if (!task?.evidence.includes('signature')) return;
  await tx
    .update(documents)
    .set({ category: SIGNATURE_CATEGORY, taskId: closed.taskId })
    .where(eq(documents.id, documentId));
}

/** The ask is cancelled: the signed copy it was waiting for is no longer asked either. */
export async function cancelSignedCopy(
  tx: DatabaseExecutor,
  action: { readonly id: string; readonly payload: Record<string, unknown> },
  userId: string,
): Promise<void> {
  const copy = action.payload.signedActionId;
  if (typeof copy !== 'string') return;
  const now = new Date();
  const [row] = await tx
    .update(customerActions)
    .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
    .where(and(eq(customerActions.id, copy), eq(customerActions.status, 'open')))
    .returning({ id: customerActions.id });
  if (row) await recordAudit(tx, userId, 'customer_action.cancelled', 'customer_action', row.id);
}
