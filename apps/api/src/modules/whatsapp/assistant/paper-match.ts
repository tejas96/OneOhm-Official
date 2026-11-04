import { isPersonDocumentCategory } from '@oneohm/domain';
import type { PaperPlace } from '../file-paper';
import { STEP_MINUTES } from './chat-step';
import type { HomeChoice } from './file-home';

/** An open request of the customer, and the home its project is on. */
export interface OpenPaper {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly propertyId: string | null;
}

/** The paper picked (or answered) for a home, kept in the chat's context for STEP_MINUTES. */
export interface FilePaper {
  readonly requestId: string | 'none';
  readonly propertyId: string | 'person';
  readonly at: number;
}

/** Files waiting for "Which paper is this?": their home and their documents. */
export interface PaperWait {
  readonly propertyId: string | 'person';
  readonly at: number;
  readonly ids: readonly string[];
}

/** A list keeps 10 rows: 9 requests and "Something else". */
const PAPER_ROWS = 9;
const fresh = (at: unknown, now: number) =>
  typeof at === 'number' && now - at <= STEP_MINUTES * 60_000;

const PAPER_TAP = /^fpaper:(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The request a "Which paper?" row was tapped for, 'none' for "Something else", else null. */
export const paperTapped = (choiceId: string | null): string | 'none' | null =>
  PAPER_TAP.exec(choiceId ?? '')?.[1] ?? null;

/**
 * The open requests a file for this home answers, oldest first. A home's are its site
 * papers; the person row's are the ID and income papers. A customer with one home whose
 * home waits on nothing else answers their person papers with it (decision 2).
 */
export function papersForHome(
  open: readonly OpenPaper[],
  choice: HomeChoice,
  homeCount: number,
): OpenPaper[] {
  const person = open.filter((paper) => isPersonDocumentCategory(paper.category));
  if (choice.propertyId === 'person') return person;
  const site = open.filter(
    (paper) =>
      !isPersonDocumentCategory(paper.category) &&
      (paper.propertyId === choice.propertyId || (homeCount === 1 && paper.propertyId === null)),
  );
  return site.length === 0 && homeCount === 1 ? person : site;
}

/** The paper picked for this home a moment ago, from the chat's context. */
export function rememberedPaper(context: unknown, choice: HomeChoice, now: number) {
  const kept = (context as { filePaper?: Partial<FilePaper> } | null)?.filePaper;
  if (typeof kept?.requestId !== 'string' || kept.propertyId !== choice.propertyId) return null;
  return fresh(kept.at, now) ? (kept as FilePaper) : null;
}

/**
 * The files waiting for "Which paper?": kept until a tap or a new list replaces them, so a
 * late tap still uses the stored file. With `now`, only while the question is fresh.
 */
export function paperWaitOf(context: unknown, now?: number): PaperWait | null {
  const wait = (context as { paperWait?: Partial<PaperWait> } | null)?.paperWait;
  if (typeof wait?.propertyId !== 'string' || !Array.isArray(wait.ids)) return null;
  return now === undefined || fresh(wait.at, now) ? (wait as PaperWait) : null;
}

/** What a file for a home does with its open requests. */
export type PaperMatch =
  | { readonly kind: 'answer'; readonly request: OpenPaper }
  | { readonly kind: 'same'; readonly title: string; readonly documentId: string }
  | { readonly kind: 'file' }
  | { readonly kind: 'ask' };

/** The request answered a moment ago in this batch, as it is now. */
export interface EarlierPaper {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly documentId: string | null;
}

/**
 * The paper picked in the last 30 minutes holds: the next file of the batch is filed with
 * the first (front and back), or answers it while still open; "Something else" files it.
 * Else: no open request files it on the home, one answers it, two or more ask.
 */
export function matchPaper(input: {
  open: readonly OpenPaper[];
  remembered: FilePaper | null;
  earlier: EarlierPaper | null;
}): PaperMatch {
  const { open, remembered, earlier } = input;
  if (remembered?.requestId === 'none') return { kind: 'file' };
  if (remembered && earlier?.id === remembered.requestId) {
    const again = open.find((paper) => paper.id === earlier.id);
    if (again) return { kind: 'answer', request: again };
    if (earlier.status === 'received' && earlier.documentId)
      return { kind: 'same', title: earlier.title, documentId: earlier.documentId };
  }
  const [only] = open;
  if (!only) return { kind: 'file' };
  return open.length === 1 ? { kind: 'answer', request: only } : { kind: 'ask' };
}

/** The "Which paper?" rows: the open requests (titles cut to fit), then "Something else". */
export function paperRows(
  open: readonly OpenPaper[],
  fit: (title: string) => string,
  somethingElse: string,
) {
  return [
    ...open
      .slice(0, PAPER_ROWS)
      .map((paper) => ({ id: `fpaper:${paper.id}`, title: fit(paper.title) })),
    { id: 'fpaper:none', title: somethingElse },
  ];
}

/** The chat's context without the "Which paper?" step and its files (cleared, not kept). */
export function withoutPaperStep(context: unknown, ended: boolean): Record<string, unknown> {
  const { step: _step, stepAt: _stepAt, ...rest } = (context ?? {}) as Record<string, unknown>;
  const kept = ended ? rest : { ...(context as object) };
  return { ...kept, paperWait: null };
}

/** "Saved: *Aadhaar card* for your home at *Pune*.", any refusal, and what that home still needs. */
export function savedWords(
  words: {
    savedFor: (kind: string, home: string) => string;
    paperSaved: (kind: string) => string;
    paperRefused: (title: string) => string;
    stillNeeded: (list: string) => string;
  },
  home: string | null,
  kind: string,
  refused: string | null,
  left: readonly { title: string }[],
): string {
  return [
    home ? words.savedFor(kind, home) : words.paperSaved(kind),
    refused ? words.paperRefused(refused) : '',
    left.length > 0 ? words.stillNeeded(left.map((paper) => paper.title).join(', ')) : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * What a home still needs, for the reply: its open papers, and for a customer with one
 * home their person papers too (that home is the only one they serve).
 */
export function stillNeededFor(
  all: readonly OpenPaper[],
  open: readonly OpenPaper[],
  choice: HomeChoice,
  homeCount: number,
): readonly OpenPaper[] {
  return homeCount === 1 && choice.propertyId !== 'person' ? all : open;
}

/** A home paper answered with no home (its request had no project): the home it was sent for. */
export function onHomeOf(filed: PaperPlace | null, place: PaperPlace | null): PaperPlace | null {
  if (!filed || filed.propertyId || !place?.propertyId) return null;
  if (isPersonDocumentCategory(filed.category)) return null;
  return { projectId: place.projectId, propertyId: place.propertyId, category: filed.category };
}
