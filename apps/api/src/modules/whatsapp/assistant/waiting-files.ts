import { type DatabaseExecutor, waConversations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { filesWaitOf } from './files-wait';
import { unfiledFiles } from './paper-reads';

/**
 * How many of the chat's files still wait for "What is this?" (redesign 5.2): Home says so
 * on its first line, so a Menu or a hello never loses a file. Files filed meanwhile (by the
 * team or another flow) are not counted.
 */
export async function waitingFileCount(
  db: DatabaseExecutor,
  chatId: string,
  customerId: string,
): Promise<number> {
  const [chat] = await db
    .select({ context: waConversations.context })
    .from(waConversations)
    .where(eq(waConversations.id, chatId));
  const wait = filesWaitOf(chat?.context);
  if (!wait) return 0;
  const live = await unfiledFiles(
    db,
    customerId,
    wait.files.map((file) => file.id),
  );
  return live.length;
}
