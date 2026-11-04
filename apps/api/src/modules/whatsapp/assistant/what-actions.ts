import { type DatabaseExecutor, documents, waMessages } from '@oneohm/database';
import { eq, inArray } from 'drizzle-orm';
import type { CustomerHome } from '../../customer-portal/customer-homes';
import type { DocumentMoveService } from '../../documents/document-move.service';
import { type Conversation, queueReply } from '../chat-store';
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
import { saveWait } from './files-wait-store';
import type { KeptFile } from './kept-files';
import { keepPending, type PendingMedia } from './media-intake';
import { type ProblemFlowService, recentRequest } from './problem-flow';
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
  await saveWait(tx, chat, { ...wait, pick: chosen });
}

/** "Problem photo": the photos wait for the problem's words, as "Report a problem" asks. */
export async function startProblem(
  tx: DatabaseExecutor,
  chat: Conversation,
  customerId: string,
  about: { wait: FilesWait; files: readonly KeptFile[]; now: number; delay: number },
): Promise<void> {
  const { wait, files, now } = about;
  const ids = files.map((file) => file.id);
  const photos: PendingMedia[] = wait.files
    .filter((file) => ids.includes(file.id))
    .map((file) => ({ type: file.type, id: file.media, mimeType: null, fileName: null, at: now }));
  const before = keepPending(chat.context, now).pending as PendingMedia[] | undefined;
  const pending = [...(before ?? []), ...photos].slice(-6);
  // The files still waiting are asked about soon, not after the one-by-one loop that ended here.
  const left = withoutFiles(wait, ids);
  const next = left && {
    ...left,
    each: false,
    eachOf: 0,
    focus: null,
    offered: null,
    pick: null,
    askAt: now + about.delay,
  };
  await saveWait(tx, chat, next, { pending });
  await startComplaint(
    tx,
    { ...chat, context: { ...(chat.context as object), filesWait: next, pending } },
    customerId,
  );
}

/** "Photo for your problem": the photos join the problem told a moment ago, and say so. */
export async function addToProblem(
  tx: DatabaseExecutor,
  problems: Pick<ProblemFlowService, 'addPhotos'>,
  chat: Conversation,
  customerId: string,
  files: readonly KeptFile[],
  now: number,
): Promise<boolean> {
  const raised = recentRequest(chat.context, now);
  if (!raised) return false;
  await problems.addPhotos(
    tx,
    chat,
    customerId,
    raised.id,
    files.map((file) => file.id),
  );
  return true;
}

/**
 * [Change]: the saved batch goes back to "not filed" (as a move does, any request it
 * answered is asked again quietly) and the customer is asked again. Too late or already
 * checked: said, with a way to reach us.
 */
export async function changeSaved(
  tx: DatabaseExecutor,
  moves: Pick<DocumentMoveService, 'release'>,
  ask: (chat: Conversation, focus: string[]) => Promise<unknown>,
  chat: Conversation,
  firstId: string,
  when: { customerId: string; now: number; delay: number },
): Promise<void> {
  const { customerId, now, delay } = when;
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
  // The changed files are asked about on their own; others still waiting keep their place.
  const before = filesWaitOf(chat.context);
  const others = (before?.files ?? []).filter((file) => !released.includes(file.id));
  const wait: FilesWait = {
    files: [...others, ...back],
    askAt: others.length > 0 ? (before?.askAt ?? now + delay) : null,
    askedAt: null,
    focus: null,
    each: false,
    eachOf: 0,
    offered: null,
    pick: null,
  };
  const extra = { filedBatches: batches.filter((one) => one !== batch) };
  await saveWait(tx, chat, wait, extra);
  await ask(
    { ...chat, context: { ...(chat.context as object), ...extra, filesWait: wait } },
    back.map((file) => file.id),
  );
}
