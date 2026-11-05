import { type DatabaseExecutor, waConversations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { type Conversation, setState } from '../chat-store';
import type { FilesWait } from './files-wait';
import { joinedOf } from './problem-joined';

/** The first time the timer has something to do: the question, or the reply to joined files. */
function nextDue(wait: FilesWait | null, context: object): Date | null {
  const times = [wait?.askAt ?? null, joinedOf(context)?.replyAt ?? null].filter(
    (time): time is number => time !== null,
  );
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

/**
 * Saves the chat's waiting files (`context.filesWait`) and, beside it, the time the question
 * is due in its own column, so the timer finds due chats by an index instead of reading
 * every chat. `extra` is anything else the same write changes in the context. A save that
 * got this far resets the count of failed attempts.
 */
export async function saveWait(
  tx: DatabaseExecutor,
  chat: Pick<Conversation, 'id' | 'state' | 'context'>,
  wait: FilesWait | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const merged = { ...(chat.context as object), ...extra, filesWait: wait };
  await setState(tx, chat.id, chat.state, merged);
  await tx
    .update(waConversations)
    .set({ filesAskAt: nextDue(wait, merged), filesAskTries: 0 })
    .where(eq(waConversations.id, chat.id));
}
