import type { DatabaseExecutor } from '@oneohm/database';
import { type Conversation, setState } from '../chat-store';
import { filePaper, type PaperPlace } from '../file-paper';
import { setStep } from './chat-step';
import { answersRequests, type HomeChoice, type KeptFile } from './file-home';
import type { OpenPaper } from './paper-match';

type Chat = Conversation;

// What "Which paper?" writes: where the files go, and what the chat remembers.

/** The waiting files are used: the step ends if it is still the question's. */
export async function endWait(
  tx: DatabaseExecutor,
  chat: Chat,
  asking: boolean,
  context: Record<string, unknown>,
): Promise<Chat> {
  if (!asking) {
    await setState(tx, chat.id, chat.state, context);
    return { ...chat, context };
  }
  await setStep(tx, chat, 'menu', context);
  return { ...chat, state: chat.state === 'human' ? 'human' : 'menu', context };
}

/**
 * The paper answered covers the next 30 minutes of files (front and back); Meta's retry
 * of the same file is told it was saved.
 */
export async function remember(
  tx: DatabaseExecutor,
  chat: Chat,
  answered: OpenPaper,
  choice: HomeChoice,
  mediaId: string | undefined,
): Promise<void> {
  const memory = { requestId: answered.id, propertyId: choice.propertyId, at: Date.now() };
  const context = { ...(chat.context as object), filePaper: memory };
  const filedMedia = mediaId ? { filedMedia: { id: mediaId, title: answered.title } } : {};
  await setState(tx, chat.id, chat.state, { ...context, ...filedMedia });
}

/** Photos and PDFs go to `papers`; a voice note, video, Word or Excel file stays `other` on the home. */
export async function fileAll(
  tx: DatabaseExecutor,
  files: readonly KeptFile[],
  papers: PaperPlace | null,
  home: PaperPlace | null,
): Promise<void> {
  for (const file of files) {
    const sound = !answersRequests(file.contentType);
    const to = sound ? (home ? { ...home, category: 'other' } : null) : papers;
    if (to) await filePaper(tx, file.id, to);
  }
}
