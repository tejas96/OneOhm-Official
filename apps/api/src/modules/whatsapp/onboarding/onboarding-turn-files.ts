import { queueReply } from '../chat-store';
import { type ChatFilesService, type FileOutcome, fileWords } from './onboarding-files';
import { speak, type Turn } from './onboarding-turn';

/**
 * A photo or paper in this turn: filed on the lead, or held until the lead is made. The
 * customer is told what happened; the caller then asks the question again. A file is never
 * an unclear answer. A filed bill also means the photo question needs no asking.
 */
export async function takeChatFile(turn: Turn, files: ChatFilesService): Promise<FileOutcome> {
  const { tx, chat } = turn;
  const got = await files.receive(tx, turn.file, {
    id: chat.id,
    leadId: turn.lead?.id ?? null,
    pending: turn.pendingFile,
  });
  turn.discard.push(...got.discard);
  if (got.pending) turn.pendingFile = got.pending;
  if (got.outcome === 'filed') turn.answers = { ...turn.answers, photo: 'sent' };
  await speak(turn, () => queueReply(tx, chat, { kind: 'text', body: fileWords(got.outcome) }));
  return got.outcome;
}

/** The lead exists now: a bill held in the chat is filed on it, in this transaction. */
export async function fileHeldBill(
  turn: Turn,
  files: ChatFilesService,
  leadId: string,
): Promise<void> {
  const held = turn.pendingFile;
  if (!held) return;
  if (await files.filePendingBill(turn.tx, leadId, held))
    turn.answers = { ...turn.answers, photo: 'sent' };
  turn.discard.push(held.storageKey);
  turn.pendingFile = undefined;
}
