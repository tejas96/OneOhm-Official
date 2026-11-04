import { type DatabaseExecutor, waConversations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { type Conversation, setState } from '../chat-store';
import type { FilesWait } from './files-wait';

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
  await setState(tx, chat.id, chat.state, {
    ...(chat.context as object),
    ...extra,
    filesWait: wait,
  });
  await tx
    .update(waConversations)
    .set({ filesAskAt: wait?.askAt != null ? new Date(wait.askAt) : null, filesAskTries: 0 })
    .where(eq(waConversations.id, chat.id));
}
