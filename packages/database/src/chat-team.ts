import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { answererFor } from './chat-answerer';
import type { DatabaseExecutor } from './client';
import { notify, notifyStaffHolders } from './notify';
import { leads } from './schema/crm.schema';
import { projects } from './schema/projects.schema';
import { outbox } from './schema/records.schema';
import { waConversations } from './schema/whatsapp.schema';

/** The parts of a chat that decide who on our side hears about it. */
export interface ChatPeople {
  readonly id: string;
  readonly phone: string;
  readonly customerId: string | null;
  readonly assignedUserId: string | null;
  readonly handledByUserId: string | null;
}

/**
 * Who answers a chat: the manager of the customer's newest project, else the owner of
 * the newest lead with this customer or number. Null sends it to the service team.
 */
export async function chatOwnerFor(
  db: DatabaseExecutor,
  chat: Pick<ChatPeople, 'customerId' | 'phone'>,
): Promise<string | null> {
  if (chat.customerId) {
    const [project] = await db
      .select({ userId: projects.managerUserId })
      .from(projects)
      .where(and(eq(projects.customerId, chat.customerId), isNotNull(projects.managerUserId)))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    if (project?.userId) return project.userId;
  }
  const [lead] = await db
    .select({ userId: leads.ownerUserId })
    .from(leads)
    .where(
      and(
        isNotNull(leads.ownerUserId),
        // Only the business's own staff answer its chats, never an outside reseller.
        sql`exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ${leads.ownerUserId} and r.kind = 'staff' and r.archived_at is null)`,
        chat.customerId
          ? or(eq(leads.customerId, chat.customerId), eq(leads.phoneE164, chat.phone))
          : eq(leads.phoneE164, chat.phone),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return lead?.userId ?? null;
}

/** A customer's chat falls to the service desk; a stranger is a new enquiry for sales. */
export const deskFor = (chat: Pick<ChatPeople, 'customerId'>) =>
  chat.customerId ? 'service.manage' : 'leads.manage';

/**
 * The people a chat alert goes to: who last answered and the owner (or whoever covers
 * for them today); when nobody can, the desk that handles chats of this kind.
 */
export async function tellChatTeam(
  db: DatabaseExecutor,
  chat: Pick<ChatPeople, 'id' | 'assignedUserId' | 'handledByUserId' | 'customerId'>,
  alert: {
    readonly kind: string;
    readonly title: string;
    readonly body: string;
    readonly key: string;
  },
): Promise<void> {
  const notice = {
    kind: alert.kind,
    title: alert.title,
    body: alert.body,
    subject: { type: 'chat' as const, id: chat.id },
  };
  const covering = await Promise.all(
    [chat.handledByUserId, chat.assignedUserId].map((userId) => answererFor(db, userId)),
  );
  const people = [...new Set(covering.filter((id): id is string => Boolean(id)))];
  if (people.length === 0) {
    await notifyStaffHolders(db, deskFor(chat), { ...notice, dedupeKey: `${alert.key}:team` });
    return;
  }
  for (const userId of people)
    await notify(db, { userId }, { ...notice, dedupeKey: `${alert.key}:${userId}` });
}

/**
 * A file we sent in a chat (an estimate PDF, a document) ended failed, by the worker or by
 * WhatsApp's receipt: the chat's people are told to send it again. Once per outbox row;
 * other messages are left alone. Both the API and the worker call this.
 */
export async function tellChatFileFailed(db: DatabaseExecutor, outboxId: string): Promise<void> {
  const [row] = await db
    .select({ template: outbox.template, recipient: outbox.recipient })
    .from(outbox)
    .where(eq(outbox.id, outboxId))
    .limit(1);
  if (row?.template !== 'session:document') return;
  const [chat] = await db
    .select({
      id: waConversations.id,
      phone: waConversations.phone,
      profileName: waConversations.profileName,
      customerId: waConversations.customerId,
      assignedUserId: waConversations.assignedUserId,
      handledByUserId: waConversations.handledByUserId,
    })
    .from(waConversations)
    .where(eq(waConversations.phone, row.recipient))
    .limit(1);
  if (!chat) return;
  const owner = chat.assignedUserId ?? (await chatOwnerFor(db, chat));
  const who = chat.profileName ? `${chat.profileName} (${chat.phone})` : chat.phone;
  await tellChatTeam(
    db,
    { ...chat, assignedUserId: owner },
    {
      kind: 'whatsapp_file_failed',
      title: 'A WhatsApp file was not sent',
      body: `A file could not be sent to ${who} on WhatsApp — please send it again.`,
      key: `wa_file_failed:${outboxId}`,
    },
  );
}
