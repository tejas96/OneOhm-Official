import type { Database } from '@oneohm/database';
import { lockedChat } from '../chat-store';
import { filesWaitOf } from './files-wait';
import { saveWait } from './files-wait-store';

/**
 * Files that join a problem on their own (redesign §12): any photo, video or voice note that
 * arrives while the problem is being told, or within `AUTO_ATTACH_SECONDS` after it was raised
 * (WhatsApp delivers a burst of media a few seconds after "Done"). They are attached when they
 * arrive; the customer gets one reply for the burst, `FILE_WAIT_SECONDS` after the last file,
 * from the same timer that asks "What is this?". The count lives in the chat's context
 * (`joined`), so a restart loses nothing.
 */

/** For this long after a problem is raised, every photo, video or voice note joins it unasked. */
export const AUTO_ATTACH_SECONDS = 120;

export type JoinedKind = 'photo' | 'video' | 'voice';

export interface Joined {
  readonly requestId: string;
  readonly photos: number;
  readonly videos: number;
  readonly voices: number;
  /** When the one reply is due. */
  readonly replyAt: number;
}

/** The burst waiting for its reply, or null. */
export function joinedOf(context: unknown): Joined | null {
  const raw = (context as { joined?: Partial<Joined> | null } | null)?.joined;
  if (!raw?.requestId || typeof raw.replyAt !== 'number') return null;
  return {
    requestId: raw.requestId,
    photos: raw.photos ?? 0,
    videos: raw.videos ?? 0,
    voices: raw.voices ?? 0,
    replyAt: raw.replyAt,
  };
}

/** One more file joined the problem: counted, and the reply is due `delaySeconds` from now. */
export function withJoined(
  context: unknown,
  requestId: string,
  kind: JoinedKind,
  now: number,
  delaySeconds: number,
): Joined {
  const before = joinedOf(context);
  const same = before && before.requestId === requestId ? before : null;
  return {
    requestId,
    photos: (same?.photos ?? 0) + (kind === 'photo' ? 1 : 0),
    videos: (same?.videos ?? 0) + (kind === 'video' ? 1 : 0),
    voices: (same?.voices ?? 0) + (kind === 'voice' ? 1 : 0),
    replyAt: now + delaySeconds * 1000,
  };
}

/** Counts one more file that joined the problem, in the chat's context (under its lock). */
export function noteJoined(
  db: Database,
  chatId: string,
  requestId: string,
  kind: JoinedKind,
  delaySeconds: number,
): Promise<void> {
  return db.transaction(async (tx) => {
    const locked = await lockedChat(tx, chatId);
    const joined = withJoined(locked.context, requestId, kind, Date.now(), delaySeconds);
    await saveWait(tx, locked, filesWaitOf(locked.context), { joined });
  });
}
