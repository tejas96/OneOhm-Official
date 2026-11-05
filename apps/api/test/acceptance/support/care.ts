import { rows } from './db';
import type { Session } from './http';
import { lastReply, replies, type SentReply } from './onboarding';
import { sendInbound } from './whatsapp';

// Helpers for the phase 6 scenarios (70-*): problems, ratings, referral and UPI, AMC, quote questions.

/** The first name of the admin: the person the care messages name. */
export async function adminFirstName(admin: Session): Promise<string> {
  const [row] = await rows<{ name: string }>(
    "SELECT split_part(full_name, ' ', 1) AS name FROM users WHERE id = $1",
    [admin.userId],
  );
  return row?.name ?? '';
}

/** The promise in the customer's words: "by 4:30 pm today" in working hours, else "…from 9:30". */
export const PROMISE = /by \d{1,2}:\d{2} [ap]m today|(today|tomorrow|on Monday) from 9:30/;

/** The calls we promised (call tasks), oldest first. */
export const callTasks = (customerId: string) =>
  rows<{ id: string; status: string; title: string; payload: Record<string, string> }>(
    `SELECT id, status::text AS status, title, payload FROM customer_actions
      WHERE customer_id = $1 AND type = 'callback' AND payload->>'kind' = 'call_task'
      ORDER BY created_at`,
    [customerId],
  );

export const requestsOf = (customerId: string) =>
  rows<{
    id: string;
    category: string;
    description: string;
    status: string;
    project_id: string | null;
    assignee_user_id: string | null;
    reopen_count: number;
    responded_at: Date | null;
    resolved_at: Date | null;
    response_due_at: Date | null;
  }>(
    `SELECT id, category, description, status, project_id, assignee_user_id, reopen_count,
            responded_at, resolved_at, response_due_at
       FROM service_requests WHERE customer_id = $1 ORDER BY created_at`,
    [customerId],
  );

/** Files the customer sent that are on this request: [category, content type]. */
export const filesOn = (requestId: string) =>
  rows<{ category: string; content_type: string }>(
    'SELECT category, content_type FROM documents WHERE service_request_id = $1 ORDER BY created_at',
    [requestId],
  );

/** The care asks of one kind (type + payload.kind), newest first. */
export const asksOfKind = (customerId: string, type: string, kind?: string) =>
  rows<{ id: string; status: string; title: string; payload: Record<string, unknown> }>(
    `SELECT id, status::text AS status, title, payload FROM customer_actions
      WHERE customer_id = $1 AND type = $2::customer_action_type
        AND ($3::text IS NULL OR payload->>'kind' = $3)
      ORDER BY created_at DESC`,
    [customerId, type, kind ?? null],
  );

/** An image the customer sends in the chat (the log-mode gateway stands in for the bytes). */
let counter = 0;
export function sendPhoto(phone: string) {
  counter += 1;
  return sendInbound(phone, {
    media: { type: 'image', fileId: `care-photo-${Date.now()}-${counter}`, mimeType: 'image/jpeg' },
  });
}

export function sendVoice(phone: string) {
  counter += 1;
  return sendInbound(phone, {
    media: { type: 'audio', fileId: `care-voice-${Date.now()}-${counter}`, mimeType: 'audio/ogg' },
  });
}

/** The first name of the person a request was given to (the service person), else the admin's. */
export async function callerNameOf(
  admin: Session,
  requestAssignee: string | null,
): Promise<string> {
  const [row] = await rows<{ name: string }>(
    "SELECT split_part(full_name, ' ', 1) AS name FROM users WHERE id = $1",
    [requestAssignee ?? admin.userId],
  );
  return row?.name ?? '';
}

/** The ids of a form's option list. */
export const optionIds = (options: unknown): string[] =>
  ((options ?? []) as { id: string }[]).map((option) => option.id);

export const bodyOf = async (phone: string): Promise<string> =>
  (await lastReply(phone))?.body ?? '';

/** The replies the bot sent after the first `skip` ones. */
export async function repliesAfter(phone: string, skip: number): Promise<SentReply[]> {
  return (await replies(phone)).slice(skip);
}
