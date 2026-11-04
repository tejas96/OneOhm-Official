/**
 * What a known customer can pick: the More rows, the answers' own buttons, and the old
 * menu ids still on messages sent before the redesign (redesign §3, decision 8). A tap
 * id is `go:<choice>`; Pay ₹X is `pay:<milestone>`, Send it now `sendit:<paper request>`,
 * a language `lang:<en|mr|hi>`.
 */
export const CHOICES = [
  'more',
  'update',
  'payments',
  'documents',
  'paper',
  'problem',
  'problems',
  'warranty',
  'refer',
  'rewards',
  'talk',
  'language',
  'receipts',
  'visit',
  'see',
  'feedback',
] as const;

export type Choice = (typeof CHOICES)[number];

/**
 * The menu ids of the 10-row menu used until 4 Nov 2026. Taps on those old messages keep
 * working, mapped to the new answers, for 30 days: remove this map (and its test) after
 * OLD_MENU_IDS_UNTIL. "menu" stays: it is still the Menu button's id.
 */
export const OLD_MENU_IDS_UNTIL = '2026-12-04';
const OLD_MENU_IDS: Readonly<Record<string, Choice>> = {
  progress: 'update',
  payments: 'payments',
  documents: 'documents',
  service: 'problem',
  requests: 'problems',
  warranty: 'warranty',
  refer: 'refer',
  rewards: 'rewards',
  feedback: 'feedback',
  human: 'talk',
};

const IDS = new Set<string>(CHOICES);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PAY_TAP = new RegExp(`^pay:(${UUID})$`);
const SEND_TAP = new RegExp(`^sendit:(${UUID})$`);
const LANGUAGE_TAP = /^lang:(en|mr|hi)$/;

/** The choice a tap id stands for: `go:<choice>`, or an old menu id. */
export function choiceOfTap(id: string | null | undefined): Choice | undefined {
  if (!id) return undefined;
  if (id.startsWith('go:')) {
    const choice = id.slice(3);
    return IDS.has(choice) ? (choice as Choice) : undefined;
  }
  return OLD_MENU_IDS[id];
}

/** The instalment a Pay ₹X tap pays, or null. */
export const payTapped = (id: string | null) => PAY_TAP.exec(id ?? '')?.[1] ?? null;
/** The paper request a Send it now tap is for, or null. */
export const sendTapped = (id: string | null) => SEND_TAP.exec(id ?? '')?.[1] ?? null;
/** The language a language button picks, or null. */
export const languageTapped = (id: string | null) =>
  (LANGUAGE_TAP.exec(id ?? '')?.[1] as 'en' | 'mr' | 'hi' | undefined) ?? null;

/** True for any of the taps above: the assistant's own, answered even in a held chat. */
export const isChoiceTap = (id: string) =>
  choiceOfTap(id) !== undefined ||
  payTapped(id) !== null ||
  sendTapped(id) !== null ||
  languageTapped(id) !== null;
