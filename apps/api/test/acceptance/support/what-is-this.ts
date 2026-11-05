import type { Session } from './http';
import { choices, lastReply, replies, type SentReply } from './onboarding';
import { sendInbound } from './whatsapp';

/** Helpers for "What is this?" (redesign 5.2): files wait, and the question goes out on a clock. */

/** Runs the due questions as if the clock stood a minute ahead (15 seconds have passed). */
export async function askAboutFiles(admin: Session, secondsLater = 60): Promise<number> {
  const { asked } = await admin.post<{ asked: number }>('/whatsapp/file-questions/run', {
    now: new Date(Date.now() + secondsLater * 1000).toISOString(),
  });
  return asked;
}

let counter = 0;
/** A photo from the customer; each call is a new WhatsApp file. */
export function sendPhoto(phone: string, fileId?: string): Promise<void> {
  counter += 1;
  return sendInbound(phone, {
    media: {
      type: 'image',
      fileId: fileId ?? `what-photo-${Date.now()}-${counter}`,
      mimeType: 'image/jpeg',
    },
  });
}

/** One photo, then the question that follows it. */
export async function photoAndQuestion(
  admin: Session,
  phone: string,
): Promise<SentReply | undefined> {
  await sendPhoto(phone);
  await askAboutFiles(admin);
  return lastReply(phone);
}

/** The questions "What is this?" the bot sent this number (buttons or lists naming what: ids). */
export async function questions(phone: string): Promise<SentReply[]> {
  return (await replies(phone)).filter((reply) =>
    choices(reply).some((id) => id.startsWith('what:')),
  );
}

export const rowIds = (reply: SentReply | undefined): string[] => choices(reply);

/** The customer's documents with where each is filed. */
export const docsOf = (customerId: string) =>
  import('./db').then(({ rows }) =>
    rows<{
      id: string;
      category: string;
      project_id: string | null;
      property_id: string | null;
    }>(
      `SELECT id, category, project_id, property_id FROM documents
        WHERE customer_id = $1 AND removed_at IS NULL ORDER BY created_at, id`,
      [customerId],
    ),
  );
