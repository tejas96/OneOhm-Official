import type { SendBody, SendOptions, SendResult } from '@oneohm/api-contracts';
import { outboxFor, rows } from './db';
import type { Session } from './http';
import { replies, type SentReply } from './onboarding';
import type { Sale } from './sales';

// Helpers for the "Send to customer" scenarios (65-*, phase 3a).

/** The customer's chat is open: they wrote in the last 24 hours (a chat row is made if needed). */
export const openChat = (phone: string, customerId: string) =>
  rows(
    `INSERT INTO wa_conversations (phone, customer_id, last_inbound_at) VALUES ($1, $2, now())
     ON CONFLICT (phone) DO UPDATE SET last_inbound_at = now(), customer_id = EXCLUDED.customer_id`,
    [phone, customerId],
  );

/** The 24-hour window closed 30 hours ago. */
export const closeChat = (phone: string) =>
  rows(
    "UPDATE wa_conversations SET last_inbound_at = now() - interval '30 hours' WHERE phone = $1",
    [phone],
  );

export const scopeOf = (sale: Pick<Sale, 'project'>) => ({ projectId: sale.project.id });

export const optionsOf = (admin: Session, scope: SendBody['scope']) => {
  const query = new URLSearchParams(scope as Record<string, string>).toString();
  return admin.get<SendOptions>(`/send-to-customer/options?${query}`);
};

export const sendTo = (admin: Session, scope: SendBody['scope'], request: SendBody['request']) =>
  admin.post<SendResult>('/send-to-customer', { scope, request });

/** Messages that are not chat sessions (templates) queued for this number. */
export async function templatesFor(phone: string, key?: string) {
  const sent = (await outboxFor(phone)).filter((row) => !row.template.startsWith('session:'));
  return key ? sent.filter((row) => row.template === key) : sent;
}

/** The last session reply of one kind to this number. */
export async function lastOf(phone: string, kind: string): Promise<SentReply | undefined> {
  return (await replies(phone)).filter((reply) => reply.kind === kind).at(-1);
}

/** The customer's open and received actions of one type, newest first. */
export const actionsOf = (customerId: string, type: string) =>
  rows<{
    id: string;
    status: string;
    property_id: string | null;
    payload: Record<string, unknown>;
    title: string;
  }>(
    `SELECT id, status::text AS status, property_id, payload, title FROM customer_actions
      WHERE customer_id = $1 AND type = $2::customer_action_type ORDER BY created_at DESC`,
    [customerId, type],
  );

/** Publishes a form (a flow id) or, with null, takes it out of use. */
export const setForm = (key: string, id: string | null) =>
  id
    ? rows(
        `INSERT INTO wa_forms (key, flow_id) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET flow_id = EXCLUDED.flow_id`,
        [key, id],
      )
    : rows('DELETE FROM wa_forms WHERE key = $1', [key]);

/** Sends the "Ask for the location" offer the send sheet shows for this place. */
export async function askLocation(admin: Session, scope: SendBody['scope']) {
  const offer = (await optionsOf(admin, scope)).offers.find((one) => one.action === 'ask_location');
  return sendTo(admin, scope, offer?.request as never);
}
