import { type DatabaseExecutor, fallBackToSms } from '@oneohm/database';

/** What the note says happened to a message WhatsApp refused as "not on WhatsApp". */
const NOT_ON_WHATSAPP = {
  sms: 'Not on WhatsApp: sent by SMS instead.',
  task: 'Not on WhatsApp: task made to tell them in person.',
  none: 'Not on WhatsApp: not sent.',
} as const;

/** Falls back to an SMS or a task for the message; the note says what happened. */
export async function fallBackNote(
  db: DatabaseExecutor,
  outboxId: string,
  words: Parameters<typeof fallBackToSms>[2],
): Promise<string> {
  return NOT_ON_WHATSAPP[await fallBackToSms(db, outboxId, words)];
}
