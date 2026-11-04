import { type DatabaseExecutor, documents, waMessages } from '@oneohm/database';
import { eq, inArray } from 'drizzle-orm';
import type { CustomerHome } from '../../customer-portal/customer-homes';
import type { DocumentMoveService } from '../../documents/document-move.service';
import { type Conversation, queueReply, setState } from '../chat-store';
import { sayWithTaps } from './closing-taps';
import { startComplaint } from './complaint-start';
import {
  type Chosen,
  type FilesWait,
  filedBatchesOf,
  filesWaitOf,
  whereTap,
  withoutFiles,
} from './files-wait';
import type { KeptFile } from './kept-files';
import { keepPending, type PendingMedia } from './media-intake';
import { WHAT_WORDS } from './what-words';

// The parts of an answer to "What is this?" that are not filing a paper.

/** "For which home?": the homes only, and the pick that waits for the answer. */
export async function askWhichHome(
  tx: DatabaseExecutor,
  chat: Conversation,
  homes: readonly CustomerHome[],
  wait: FilesWait,
  chosen: Chosen,
): Promise<void> {
  await queueReply(tx, chat, {
    kind: 'list',
    body: WHAT_WORDS.whichHome,
    button: WHAT_WORDS.choose,
    rows: homes.slice(0, 10).map((home) => ({
      id: whereTap(home.propertyId),
      title: home.title,
      description: home.description,
    })),
  });
  const context = { ...(chat.context as object), filesWait: { ...wait, pick: chosen } };
  await setState(tx, chat.id, chat.state, context);
}

/** "Problem photo": the photos wait for the problem's words, as "Report a problem" asks. */
export async function startProblem(
  tx: DatabaseExecutor,
  chat: Conversation,
  customerId: string,
  wait: FilesWait,
  files: readonly KeptFile[],
  now: number,
): Promise<void> {
  const ids = files.map((file) => file.id);
  const photos: PendingMedia[] = wait.files
    .filter((file) => ids.includes(file.id))
    .map((file) => ({ type: file.type, id: file.media, mimeType: null, fileName: null, at: now }));
  const before = keepPending(chat.context, now).pending as PendingMedia[] | undefined;
  const context = {
    ...(chat.context as object),
    filesWait: withoutFiles(wait, ids),
    pending: [...(before ?? []), ...photos].slice(-6),
  };
  await setState(tx, chat.id, chat.state, context);
  await startComplaint(tx, { ...chat, context }, customerId);
}

/**
 * [Change]: the saved batch goes back to "not filed" (as a move does, any request it
 * answered is asked again quietly) and the customer is asked again. Too late or already
 * checked: said, with a way to reach us.
 */
export async function changeSaved(
  tx: DatabaseExecutor,
  moves: Pick<DocumentMoveService, 'release'>,
  ask: (chat: Conversation) => Promise<unknown>,
  chat: Conversation,
  customerId: string,
  firstId: string,
  now: number,
): Promise<void> {
  const batches = filedBatchesOf(chat.context, now);
  const batch = batches.find((one) => one.ids[0] === firstId);
  const released = batch ? await moves.release(tx, customerId, batch.ids) : [];
  if (!batch || released.length === 0)
    return sayWithTaps(tx, chat, WHAT_WORDS.changeLate, ['talk', 'menu']);
  const rows = await tx
    .select({ id: documents.id, type: documents.contentType, media: waMessages.mediaId })
    .from(documents)
    .innerJoin(waMessages, eq(waMessages.documentId, documents.id))
    .where(inArray(documents.id, released));
  const back = rows.flatMap((row) =>
    row.media
      ? [
          {
            id: row.id,
            media: row.media,
            type: row.type.startsWith('image/') ? ('image' as const) : ('document' as const),
            at: now,
          },
        ]
      : [],
  );
  const before = filesWaitOf(chat.context);
  const wait: FilesWait = {
    files: [...(before?.files ?? []).filter((file) => !released.includes(file.id)), ...back],
    askAt: null,
    askedAt: null,
    focus: null,
    each: false,
    eachOf: 0,
    offered: null,
    pick: null,
  };
  const context = {
    ...(chat.context as object),
    filesWait: wait,
    filedBatches: batches.filter((one) => one !== batch),
  };
  await setState(tx, chat.id, chat.state, context);
  await ask({ ...chat, context });
}
