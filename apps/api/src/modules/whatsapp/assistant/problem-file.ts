import type { DatabaseExecutor } from '@oneohm/database';
import { type Conversation, lockedChat } from '../chat-store';
import { setStep } from './chat-step';
import { askAgain, type Draft, draftOf, remember } from './complaint-start';

/** A report keeps this many photos and voice notes; the third raises it. */
export const MAX_FILES = 3;

/** A photo sent this soon after the last question is saved without asking it again. */
export const PROMPT_GAP_MS = 10_000;

/**
 * The draft with one more file, and whether the question is asked again (the first file, or the last
 * question is older than `PROMPT_GAP_MS`). Null when nothing changes: the file is there already or the
 * draft is full.
 */
export function withFile(
  draft: Draft,
  documentId: string,
  now: number,
): { readonly draft: Draft; readonly ask: boolean } | null {
  const had = draft.files ?? [];
  if (had.includes(documentId) || had.length >= MAX_FILES) return null;
  const stale = draft.promptedAt === undefined || now - draft.promptedAt > PROMPT_GAP_MS;
  return { draft: { ...draft, files: [...had, documentId] }, ask: had.length === 0 || stale };
}

/** Whether the draft has both answers, so its next file may raise the report. */
export const answered = (draft: Draft) => draft.stage === 'extra' && !!draft.kind && !!draft.since;

export type FileKept =
  | { readonly kind: 'none' | 'saved' }
  | { readonly kind: 'raise'; readonly chat: Conversation; readonly draft: Draft };

/**
 * A file sent while the report waits, added to the draft read under the chat's lock, so photos that
 * arrive together all stay. The third file closes the report's step in the same transaction (no later
 * file can raise it twice); the caller raises it. Nothing slow runs while the lock is held.
 */
export function keepFile(
  db: { transaction: <T>(run: (tx: DatabaseExecutor) => Promise<T>) => Promise<T> },
  chatId: string,
  documentId: string,
  now = Date.now(),
): Promise<FileKept> {
  return db.transaction(async (tx) => {
    const locked = await lockedChat(tx, chatId);
    const draft = draftOf(locked.context);
    if (!draft) return { kind: 'none' };
    const next = withFile(draft, documentId, now);
    if (!next) return { kind: 'saved' };
    if (answered(draft) && (next.draft.files?.length ?? 0) >= MAX_FILES) {
      await setStep(tx, locked, 'menu', {});
      return { kind: 'raise', chat: locked, draft: next.draft };
    }
    if (next.ask) await askAgain(tx, locked, next.draft);
    else await remember(tx, locked, next.draft);
    return { kind: 'saved' };
  });
}
