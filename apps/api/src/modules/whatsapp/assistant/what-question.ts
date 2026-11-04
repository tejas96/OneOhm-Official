import type { ChatReply } from '../chat-reply';
import { DESCRIPTION_MAX, fitTitle, ROW_MAX } from './chat-words';
import { askedTap, itemTap } from './files-wait';
import { WHAT_WORDS } from './what-words';

/** A paper we asked for: its title, and the home it is for (none for an ID paper). */
export interface AskedRow {
  readonly id: string;
  readonly title: string;
  readonly home: string | null;
}

/** A paper on a checklist that the customer has not sent: offered when nothing is asked. */
export interface MissingRow {
  readonly key: string;
  /** The home it is for; null for an ID paper, which serves every home. */
  readonly propertyId: string | null;
  readonly title: string;
  readonly home: string | null;
}

export interface QuestionInput {
  /** How many files the question is about. */
  readonly count: number;
  /** All of them are photos (the question says "photos", else "files"). */
  readonly photos: boolean;
  /** "File 2 of 3" while asking about each file after "They're different". */
  readonly each: { readonly n: number; readonly of: number } | null;
  /** `first`: the asked papers first; `more`: after "Something else", never the asked ones. */
  readonly stage: 'first' | 'more';
  readonly asked: readonly AskedRow[];
  readonly missing: readonly MissingRow[];
}

/** A list keeps 10 rows. */
const ROWS = 10;

const row = (id: string, title: string, description?: string) => ({
  id,
  title: fitTitle(title, ROW_MAX),
  ...(description ? { description: fitTitle(description, DESCRIPTION_MAX) } : {}),
});

/**
 * The "What is this?" message for files that just arrived (redesign 5.2). One paper asked:
 * "Is this your electricity bill for Sangli?" with Yes / Something else. Two or more: the
 * asked papers. Nothing asked: the customer's missing checklist papers (trimmed to fit), then
 * Payment proof, Problem photo and Something else. A burst adds "They're different".
 */
export function buildQuestion(input: QuestionInput): { reply: ChatReply; offered: string | null } {
  const words = WHAT_WORDS;
  const { count, asked, stage } = input;
  const burst = count > 1 && input.each === null;
  const body = input.each
    ? words.askEach(input.each.n, input.each.of)
    : burst
      ? words.askMany(count, input.photos)
      : words.ask;
  const different = burst
    ? [row('what:diff', words.rows.different.title, words.rows.different.description)]
    : [];
  const [only] = asked;
  if (stage === 'first' && asked.length === 1 && only) {
    const confirm = burst
      ? words.confirmMany(count, input.photos, only.title, only.home)
      : words.confirmOne(only.title, only.home);
    const buttons = [
      { id: 'what:yes', title: words.buttons.yes },
      { id: 'what:more', title: words.buttons.else },
      ...(burst ? [{ id: 'what:diff', title: words.buttons.different }] : []),
    ];
    return { reply: { kind: 'buttons', body: confirm, buttons }, offered: only.id };
  }
  const list = (rows: ReturnType<typeof row>[]): ChatReply => ({
    kind: 'list',
    body,
    button: words.choose,
    rows,
  });
  if (stage === 'first' && asked.length >= 2) {
    const room = ROWS - 1 - different.length;
    const rows = asked
      .slice(0, room)
      .map((one) => row(askedTap(one.id), one.title, one.home ?? words.allHomes));
    const elsewhere = row('what:more', words.rows.other.title, words.rows.other.description);
    return { reply: list([...rows, elsewhere, ...different]), offered: null };
  }
  const fixed = [
    row('what:pay', words.rows.pay.title, words.rows.pay.description),
    row('what:prob', words.rows.problem.title, words.rows.problem.description),
    row('what:other', words.rows.other.title, words.rows.other.description),
    ...different,
  ];
  const rows = input.missing
    .slice(0, ROWS - fixed.length)
    .map((one) => row(itemTap(one.key, one.propertyId), one.title, one.home ?? words.allHomes));
  return { reply: list([...rows, ...fixed]), offered: null };
}
