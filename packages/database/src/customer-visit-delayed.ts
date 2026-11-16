import { chatWindowOpen, customerLanguage } from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';
import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { noticeCustomer, queueCustomerMessageAs } from './customer-message';
import { chatSentence } from './customer-message-chat';
import { homeNameOf } from './paper-requests';
import { customers } from './schema/crm.schema';
import { projectTasks } from './schema/projects.schema';
import { outbox } from './schema/records.schema';
import type { visits } from './schema/visits.schema';
import { waConversations, waMessages } from './schema/whatsapp.schema';
import { currentWorkforcePolicy } from './travel-snapshot';

/**
 * The customer's chat, when a chat message can go now: the 24-hour window is open and they
 * have not said STOP (in the chat or by switching WhatsApp off). Null otherwise.
 */
async function openChat(db: DatabaseExecutor, phone: string) {
  const [chat] = await db
    .select({
      id: waConversations.id,
      at: waConversations.lastInboundAt,
      out: waConversations.optedOutAt,
    })
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  if (!chat || chat.out || !chatWindowOpen(chat.at)) return null;
  const [customer] = await db
    .select({ optIn: customers.whatsappOptIn })
    .from(customers)
    .where(eq(customers.phoneE164, phone))
    .limit(1);
  return customer?.optIn === false ? null : chat;
}

/** One chat text in the caller's transaction, kept in the chat history; the key makes it once. */
async function queueChatText(
  db: DatabaseExecutor,
  chat: { readonly id: string },
  phone: string,
  body: string,
  dedupeKey: string,
): Promise<void> {
  const [row] = await db
    .insert(outbox)
    .values({
      channel: 'whatsapp',
      recipient: phone,
      template: 'session:text',
      payload: { kind: 'text', body },
      dedupeKey,
      createdAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing()
    .returning({ id: outbox.id, createdAt: outbox.createdAt });
  if (!row) return;
  await db.insert(waMessages).values({
    conversationId: chat.id,
    direction: 'out',
    kind: 'text',
    body,
    outboxId: row.id,
    createdAt: row.createdAt,
  });
}

/**
 * The planned visit's customer is told the team is running late (Duty Day step 6, "Nothing goes
 * silent"), once per planned visit: a chat message while their chat is open, else the approved
 * template (or the usual SMS), always with the app notice. Nothing when the policy switch
 * `customerVisitMessages` is off, the task does not message its customer, or the visit has no
 * customer yet. STOP is kept by the routing.
 */
export async function tellVisitDelayed(
  db: DatabaseExecutor,
  visit: Pick<
    typeof visits.$inferSelect,
    'id' | 'customerId' | 'taskId' | 'projectId' | 'propertyId'
  >,
): Promise<void> {
  if (!visit.customerId) return;
  const policy = await currentWorkforcePolicy(db);
  if (!policy.travel.customerVisitMessages) return;
  if (visit.taskId) {
    const [task] = await db
      .select({ notify: projectTasks.notifyCustomer })
      .from(projectTasks)
      .where(eq(projectTasks.id, visit.taskId));
    if (!task?.notify) return;
  }
  const [customer] = await db
    .select({
      name: customers.name,
      phone: customers.phoneE164,
      language: customers.preferredLanguage,
    })
    .from(customers)
    .where(eq(customers.id, visit.customerId));
  if (!customer) return;
  const payload = {
    customer: titleCaseName(customer.name),
    home: await homeNameOf(db, visit.projectId, visit.propertyId),
  };
  const key = `visit_delayed:${visit.id}`;
  const chat = await openChat(db, customer.phone);
  const text = chat && chatSentence('visit_delayed', payload, customerLanguage(customer.language));
  if (!chat || !text) {
    await queueCustomerMessageAs(db, customer.phone, 'visit_delayed', payload, key);
    return;
  }
  await queueChatText(db, chat, customer.phone, text, key);
  await noticeCustomer(db, customer.phone, 'visit_delayed', payload, key);
}
