/**
 * The files a customer sent that wait for "What is this?" (redesign 5.2). They are stored
 * the moment they arrive; here the chat only remembers which ones wait, when to ask, and
 * what the open question is about. All of it lives in the chat's context (`filesWait`), so
 * a restart loses nothing and Menu, hello or any other step never drops a file.
 */

/** One question is about this many files at most (a list's worth); the rest wait for the next. */
export const ASK_AT_MOST = 10;
/** A question older than this is "old": tapping it asks again with the latest files. */
export const QUESTION_HOURS = 24;
const HOUR = 3_600_000;

/** One waiting file: its document, the WhatsApp media it came in, and when. */
export interface WaitingFile {
  readonly id: string;
  readonly media: string;
  readonly type: 'image' | 'video' | 'document';
  readonly at: number;
}

/** What the customer picked that still needs a home ("For which home?"). */
export type Chosen =
  | { readonly kind: 'ask'; readonly actionId: string }
  | { readonly kind: 'item'; readonly key: string; readonly propertyId: string | null }
  | { readonly kind: 'other' };

export interface FilesWait {
  readonly files: readonly WaitingFile[];
  /** When the question goes out; null once it has gone (or nothing is scheduled). */
  readonly askAt: number | null;
  readonly askedAt: number | null;
  /** The files the open question was asked about (an answer files only these). */
  readonly focus: readonly string[] | null;
  readonly each: boolean;
  /** The files being asked about one by one (for "File 2 of 3"); later files are not among them. */
  readonly eachIds: readonly string[];
  /** The asked paper offered with Yes / Something else. */
  readonly offered: string | null;
  readonly pick: Chosen | null;
}

const EMPTY: FilesWait = {
  files: [],
  askAt: null,
  askedAt: null,
  focus: null,
  each: false,
  eachIds: [],
  offered: null,
  pick: null,
};

/** The chat's waiting files, or null when none wait. */
export function filesWaitOf(context: unknown): FilesWait | null {
  const raw = (context as { filesWait?: Partial<FilesWait> | null } | null)?.filesWait;
  if (!raw || !Array.isArray(raw.files) || raw.files.length === 0) return null;
  return { ...EMPTY, ...raw, files: raw.files } as FilesWait;
}

/** A file just arrived: it waits (once), and the question is due `delay` seconds from now. */
export function withFile(
  context: unknown,
  file: WaitingFile,
  now: number,
  delaySeconds: number,
): FilesWait {
  const before = filesWaitOf(context) ?? EMPTY;
  const files = [...before.files.filter((one) => one.id !== file.id), file];
  // The open question stays about the files it was asked about; the new file waits for its own.
  return { ...before, files, askAt: now + delaySeconds * 1000 };
}

/** Whether the question is due now. */
export const isDue = (wait: FilesWait, now: number): boolean =>
  wait.askAt !== null && wait.askAt <= now;

/** True when the question went out more than a day ago. */
export const isOldQuestion = (wait: FilesWait, now: number): boolean =>
  wait.askedAt !== null && now - wait.askedAt > QUESTION_HOURS * HOUR;

/** The waiting files without these (they were filed or sent on); null when none are left. */
export function withoutFiles(wait: FilesWait, ids: readonly string[]): FilesWait | null {
  const files = wait.files.filter((file) => !ids.includes(file.id));
  return files.length === 0 ? null : { ...wait, files };
}

/** The question was asked now about these files. */
export function asked(
  wait: FilesWait,
  now: number,
  about: {
    focus: readonly string[] | null;
    offered: string | null;
    each?: { ids: readonly string[] } | null;
  },
): FilesWait {
  return {
    ...wait,
    // A file that came meanwhile keeps its own time; the question just asked used up a due one.
    askAt: wait.askAt !== null && wait.askAt > now ? wait.askAt : null,
    askedAt: now,
    focus: about.focus,
    offered: about.offered,
    each: about.each === undefined ? wait.each : about.each !== null,
    eachIds: about.each ? about.each.ids : about.each === null ? [] : wait.eachIds,
    pick: null,
  };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TAP = new RegExp(
  `^what:(yes|more|diff|pay|prob|probadd|other|ask|a:(${UUID})|i:(${UUID}|person):([a-z0-9_]{1,50})|change:(${UUID}))$`,
);
const WHERE = new RegExp(`^where:(${UUID})$`);

type PlainTap = 'yes' | 'more' | 'diff' | 'pay' | 'prob' | 'probadd' | 'other' | 'ask';

/** A tap on the "What is this?" question or the Saved reply. */
export type WhatTap =
  | { readonly t: PlainTap }
  | { readonly t: 'a'; readonly actionId: string }
  | { readonly t: 'i'; readonly key: string; readonly propertyId: string | null }
  | { readonly t: 'change'; readonly first: string };

/** What a tap id says, or null for any other tap. */
export function readWhatTap(id: string | null | undefined): WhatTap | null {
  const m = TAP.exec(id ?? '');
  if (!m) return null;
  if (m[2]) return { t: 'a', actionId: m[2] };
  if (m[3] && m[4]) return { t: 'i', key: m[4], propertyId: m[3] === 'person' ? null : m[3] };
  if (m[5]) return { t: 'change', first: m[5] };
  return { t: m[1] as PlainTap };
}

/** The home a "For which home?" row was tapped for, or null. */
export const readWhereTap = (id: string | null | undefined): string | null =>
  WHERE.exec(id ?? '')?.[1] ?? null;

export const isWhatTap = (id: string | null | undefined): boolean =>
  readWhatTap(id) !== null || readWhereTap(id) !== null;

/** The tap ids the question uses. */
export const askedTap = (actionId: string) => `what:a:${actionId}`;
export const itemTap = (key: string, propertyId: string | null) =>
  `what:i:${propertyId ?? 'person'}:${key}`;
export const changeTap = (firstId: string) => `what:change:${firstId}`;
export const whereTap = (propertyId: string) => `where:${propertyId}`;

/** Papers just saved, so [Change] can take them back for a day. */
export interface FiledBatch {
  readonly ids: readonly string[];
  readonly at: number;
}

const KEEP_BATCHES = 5;

export function filedBatchesOf(context: unknown, now: number): FiledBatch[] {
  const list = (context as { filedBatches?: unknown } | null)?.filedBatches;
  if (!Array.isArray(list)) return [];
  return (list as FiledBatch[]).filter(
    (batch) => Array.isArray(batch?.ids) && now - batch.at <= QUESTION_HOURS * HOUR,
  );
}

export function withBatch(context: unknown, ids: readonly string[], now: number): FiledBatch[] {
  return [...filedBatchesOf(context, now), { ids, at: now }].slice(-KEEP_BATCHES);
}
