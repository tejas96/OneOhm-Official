import type { OnboardingSettingsRecord } from '@oneohm/api-contracts';
import { rows } from './db';
import type { Session } from './http';
import { sendInbound } from './whatsapp';

/**
 * Helpers for the WhatsApp onboarding scenarios: switch the owner's settings for a test
 * and put them back, and read what the bot said and what it wrote on the lead.
 */
export async function withOnboarding(
  admin: Session,
  change: Partial<OnboardingSettingsRecord>,
): Promise<() => Promise<void>> {
  const before = await admin.get<OnboardingSettingsRecord>('/settings/onboarding');
  await admin.put('/settings/onboarding', { ...before, ...change });
  return async () => {
    await admin.put('/settings/onboarding', before);
  };
}

export interface SentReply {
  kind: string;
  body: string;
  buttons?: { id: string; title: string }[];
  rows?: { id: string; title: string }[];
  /** A session document: its link, file name and caption. */
  link?: string;
  filename?: string;
  caption?: string;
}

/** The bot's replies to this number, oldest first. */
export async function replies(phone: string): Promise<SentReply[]> {
  const sent = await rows<{ payload: SentReply }>(
    `SELECT payload FROM outbox WHERE recipient = $1 AND template LIKE 'session:%'
      ORDER BY created_at, id`,
    [phone],
  );
  return sent.map((row) => row.payload);
}

export async function lastReply(phone: string): Promise<SentReply | undefined> {
  return (await replies(phone)).at(-1);
}

/** The ids a reply offers to tap, buttons or list rows. */
export const choices = (reply: SentReply | undefined): string[] =>
  [...(reply?.buttons ?? []), ...(reply?.rows ?? [])].map((choice) => choice.id);

export interface ChatRow {
  id: string;
  state: string;
  language: string | null;
  ob: { answers: Record<string, unknown>; misses: number } | null;
}

export async function chatOf(phone: string): Promise<ChatRow> {
  const [chat] = await rows<ChatRow>(
    `SELECT id, state, language, context->'ob' AS ob FROM wa_conversations WHERE phone = $1`,
    [phone],
  );
  if (!chat) throw new Error(`No chat for ${phone}.`);
  return chat;
}

export interface LeadRow {
  id: string;
  name: string;
  city: string;
  source: string;
  owner_user_id: string | null;
  subsidy_category: string;
  estimated_wp: number | null;
  next_action_on: string;
  next_action_note: string;
}

export async function leadsOf(phone: string): Promise<LeadRow[]> {
  return rows<LeadRow>(
    `SELECT id, name, city, source, owner_user_id, subsidy_category, estimated_wp,
            to_char(next_action_on, 'YYYY-MM-DD') AS next_action_on, next_action_note
       FROM leads WHERE phone_e164 = $1`,
    [phone],
  );
}

/** The lead's timeline notes, oldest first. */
export async function notesOf(leadId: string): Promise<{ kind: string; note: string }[]> {
  return rows(
    `SELECT kind::text AS kind, note FROM lead_activities WHERE lead_id = $1
      ORDER BY created_at, id`,
    [leadId],
  );
}

/** Staff alerts raised when this chat was handed to a person (one row per person told). */
export async function handOverAlerts(
  chatId: string,
): Promise<{ user_id: string; body: string; dedupe_key: string }[]> {
  return rows(
    `SELECT user_id, body, dedupe_key FROM notifications
      WHERE kind = 'whatsapp_handover' AND subject_id = $1`,
    [chatId],
  );
}

/** How many hand-overs alerted staff: one alert may reach several people of a desk. */
export async function handOverCount(chatId: string): Promise<number> {
  const keys = (await handOverAlerts(chatId)).map((alert) =>
    alert.dedupe_key.split(':').slice(0, 3).join(':'),
  );
  return new Set(keys).size;
}

/** A tap by id: the language, name and photo questions are buttons, the rest lists. */
export const tap = (phone: string, id: string) =>
  sendInbound(
    phone,
    /^ob:(language|name|photo):/.test(id) ? { buttonReply: id } : { listReply: id },
  );
export const say = (phone: string, text: string) => sendInbound(phone, { text });

/** "hi", English, the WhatsApp name, then Pune: the lead now exists. */
export async function upToSite(phone: string): Promise<void> {
  await say(phone, 'hi');
  await tap(phone, 'ob:language:en');
  await tap(phone, 'ob:name:yes');
  await tap(phone, 'ob:city:Pune');
}

/** What "Call me back" promises (the same working-time rule as the API). */
export { promisedCall } from './work-days';
