import type { DatabaseExecutor } from '@oneohm/database';
import type { Conversation } from '../chat-store';
import { markContext } from './chat-step';

/** Unsupported messages sent within this long of the last one are one burst (one reply). */
export const UNSUPPORTED_BURST_SECONDS = 30;

/**
 * True for the first unsupported message of a burst (and notes the time); false for the ones
 * that follow within `UNSUPPORTED_BURST_SECONDS`, which get no second reply.
 */
export async function firstUnsupported(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'id' | 'context'>,
  now = Date.now(),
): Promise<boolean> {
  const at = (chat.context as { unsupportedAt?: unknown } | null)?.unsupportedAt;
  if (typeof at === 'number' && now - at < UNSUPPORTED_BURST_SECONDS * 1000) return false;
  await markContext(db, chat.id, { unsupportedAt: now });
  return true;
}
