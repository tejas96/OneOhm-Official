import {
  answererFor,
  type DatabaseExecutor,
  leads,
  notify,
  notifyStaffHolders,
  projects,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Conversation } from './chat-store';

/**
 * Who answers a chat: the manager of the customer's newest project, else the owner of
 * the newest lead with this customer or number. Null sends it to the service team.
 */
export async function chatOwnerFor(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'customerId' | 'phone'>,
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

/** Gives an unowned chat its owner (or `fallback`, such as the person opening it). */
export async function ensureChatOwner<T extends Conversation>(
  db: DatabaseExecutor,
  chat: T,
  fallback: string | null = null,
): Promise<T> {
  if (chat.assignedUserId) return chat;
  const owner = (await chatOwnerFor(db, chat)) ?? fallback;
  if (!owner) return chat;
  await db
    .update(waConversations)
    .set({ assignedUserId: owner })
    .where(and(eq(waConversations.id, chat.id), isNull(waConversations.assignedUserId)));
  return { ...chat, assignedUserId: owner };
}

/**
 * The people a chat alert goes to: who last answered and the owner (or whoever covers
 * for them today); when nobody can, the desk that handles chats of this kind.
 */
export async function tellChatTeam(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'id' | 'assignedUserId' | 'handledByUserId' | 'customerId'>,
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

/** A customer's chat falls to the service desk; a stranger is a new enquiry for sales. */
export const deskFor = (chat: Pick<Conversation, 'customerId'>) =>
  chat.customerId ? 'service.manage' : 'leads.manage';

/**
 * A project got a manager: the customer's chat moves to them, unless another person
 * answered it in the last 24 hours (a conversation in progress stays where it is).
 */
export async function moveCustomerChats(
  db: DatabaseExecutor,
  customerId: string,
  toUserId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const moved = await db
    .update(waConversations)
    .set({ assignedUserId: toUserId, updatedAt: new Date() })
    .where(
      and(
        eq(waConversations.customerId, customerId),
        sql`not exists (select 1 from ${waMessages} where ${waMessages.conversationId} = ${waConversations.id} and ${waMessages.direction} = 'out' and ${waMessages.sentByUserId} is not null and ${waMessages.sentByUserId} <> ${toUserId} and ${waMessages.createdAt} > ${since})`,
      ),
    )
    .returning({ id: waConversations.id });
  return moved.length;
}
