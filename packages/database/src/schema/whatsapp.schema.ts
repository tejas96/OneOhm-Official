import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt } from './columns';
import { customers } from './crm.schema';
import { users } from './identity.schema';
import { outbox } from './records.schema';

/**
 * One WhatsApp chat per phone number (PRD 6.1). `state` is where the assistant is in
 * the chat; while a person has taken over, the assistant stays quiet.
 */
export const waConversations = pgTable(
  'wa_conversations',
  {
    id: primaryId(),
    phone: text('phone').notNull().unique(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    profileName: text('profile_name'),
    /** The language the customer picked for the onboarding chat: en, mr or hi. */
    language: text('language'),
    state: text('state').notNull().default('menu'),
    context: jsonb('context').notNull().default({}),
    lastInboundAt: instant('last_inbound_at'),
    /** When the person sent STOP; empty once they send START. Templates and nudges skip them. */
    optedOutAt: instant('opted_out_at'),
    handedOverAt: instant('handed_over_at'),
    handledByUserId: uuid('handled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /**
     * Who answers this chat: the project manager, else the lead's owner. Empty means the
     * service team's shared queue. Kept when the chat goes back to the assistant.
     */
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('wa_conversations_customer_idx').on(table.customerId),
    index('wa_conversations_assigned_idx').on(table.assignedUserId),
  ],
);

/** Every message in a chat, both ways. Outgoing ones point at their outbox row. */
export const waMessages = pgTable(
  'wa_messages',
  {
    id: primaryId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => waConversations.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    /** WhatsApp's message ID for incoming messages; a repeat delivery is ignored. */
    waMessageId: text('wa_message_id').unique(),
    kind: text('kind').notNull(),
    body: text('body').notNull(),
    outboxId: uuid('outbox_id').references(() => outbox.id, { onDelete: 'set null' }),
    sentByUserId: uuid('sent_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [index('wa_messages_conversation_idx').on(table.conversationId, table.createdAt)],
);
