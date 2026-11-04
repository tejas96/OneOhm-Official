import type { Choice } from './chat-choices';
import { CHAT_LISTS } from './chat-words';

/**
 * Every word list the assistant reads typed text with, in English, Marathi and Hindi, kept
 * in one place (principles §7: rules only for now; an AI step can sit in front of the same
 * answers later). Matching ignores case, punctuation and emoji.
 */

/** Lower case, letters and digits only, single spaces: "Thanks!! 🙏" → "thanks". */
export const plainWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();

/** A word list written as "a|b|c", which keeps long lists short on the page. */
const list = (words: string) => words.split('|');

const HELLO = list(
  'hi|hii|hiii|hello|helo|hey|hai|hi there|hello there|start|namaste|namaskar|नमस्कार|नमस्ते|हाय|हॅलो|हेलो|हैलो',
);
const MENU = list('menu|main menu|मेनू|मेन्यू|मेनु|मेन्यु|मेन्यूं');

/** Short words that need no answer beyond a warm word back (redesign §14). */
const SMALL_TALK = {
  thanks: list(
    'thanks|thank you|thankyou|thanks a lot|thank you so much|thanks so much|thx|tq|ty|धन्यवाद|थँक्यू|थैंक्यू|शुक्रिया|आभार|आभारी आहे',
  ),
  ok: list(
    'ok|okay|okk|okey|ok ok|k|fine|done|noted|got it|ho gaya|hogaya|zala|ठीक|ठीक आहे|ठीक है|बरं|बर|झाले|झालं|हो गया|अच्छा|ओके',
  ),
  morning: list('good morning|gm|शुभ सकाळ|सुप्रभात|गुड मॉर्निंग'),
  evening: list('good evening|शुभ संध्याकाळ|शुभ संध्या'),
  night: list('good night|gn|शुभ रात्री|शुभ रात्रि|गुड नाईट'),
} as const;
export type SmallTalk = keyof typeof SMALL_TALK;

/** Whole messages that name one answer (besides the buttons' and rows' own titles). */
const EXACT: Partial<Record<Choice, readonly string[]>> = {
  talk: list('help|मदत|मदद|talk to a person|talk to us'),
  problems: list('requests|my requests|विनंती|विनंत्या|अनुरोध'),
  feedback: list('feedback|rating|rate us|रेटिंग'),
  update: list('काम'),
  language: list('language|भाषा'),
  paper: list('send a paper|send paper'),
};

/**
 * Words anywhere in the message that point to one answer ("when will you come?" → project
 * update). The first answer in this order wins.
 */
const KNOWN: readonly (readonly [Choice, readonly string[]])[] = [
  ['problem', list('problem|complaint|not working|error|तक्रार|समस्या|शिकायत|खराब')],
  [
    'payments',
    list(
      'pay|paid|payment|payments|due|how much|balance|kitna|kitne|kiti|किती|कितना|कितने|कितनी|पेमेंट|पैसे|हप्ता|भुगतान|किस्त|बाकी',
    ),
  ],
  [
    'documents',
    list(
      'receipt|invoice|document|documents|papers|quotation|पावती|रसीद|कागद|कागदपत्र|कागदपत्रे|दस्तावेज|दस्तावेज़|कागज़|कागज|कोटेशन',
    ),
  ],
  // "bill" alone could be the electricity bill or what they owe: asked ("Which bill?").
  ['bill', list('bill|bills|light bill|बिल|बिजली बिल|वीज बिल')],
  ['warranty', list('warranty|amc|guarantee|वॉरंटी|वारंटी|गॅरंटी|गारंटी')],
  ['refer', list('refer|referral')],
  ['rewards', list('reward|rewards|बक्षीस|इनाम')],
  [
    'update',
    list(
      'status|progress|update|project|when|kab|kevha|kadhi|visit|subsidy|installation|प्रगती|प्रगति|स्थिती|स्थिति|प्रकल्प|प्रोजेक्ट|केव्हा|कधी|कब|सबसिडी|अनुदान|भेट',
    ),
  ],
];

/** Every title we show, in every language, read back as the choice it stands for. */
const TITLES: readonly (readonly [string, Choice])[] = Object.values(CHAT_LISTS).flatMap(
  (words) => [
    ...Object.entries(words.more.rows).map(
      ([choice, row]) => [row.title, choice as Choice] as const,
    ),
    [words.buttons.update, 'update'] as const,
    [words.buttons.more, 'more'] as const,
    [words.buttons.problems, 'problems'] as const,
    [words.buttons.talkTeam, 'talk'] as const,
    [words.buttons.receipts, 'receipts'] as const,
    [words.buttons.rewards, 'rewards'] as const,
  ],
);

const set = (words: readonly string[]) => new Set(words.map(plainWords));
const HELLO_SET = set(HELLO);
const MENU_SET = set(MENU);
const SMALL_TALK_SETS = Object.entries(SMALL_TALK).map(
  ([kind, words]) => [kind as SmallTalk, set(words)] as const,
);
const EXACT_MAP = new Map<string, Choice>([
  ...TITLES.map(([title, choice]) => [plainWords(title), choice] as const),
  ...Object.entries(EXACT).flatMap(([choice, words]) =>
    (words ?? []).map((word) => [plainWords(word), choice as Choice] as const),
  ),
  ...KNOWN.flatMap(([choice, words]) => words.map((word) => [plainWords(word), choice] as const)),
]);

/** A hello ("Hi", "Hello!", "नमस्कार"): Home. */
export const isHello = (text: string) => HELLO_SET.has(plainWords(text));
/** The typed word "menu" in any language: Home. */
export const isMenuWord = (text: string) => MENU_SET.has(plainWords(text));

const ONLY_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

/** "ok", "thanks", 👍, "good morning"… (trailing punctuation or emoji allowed), else null. */
export function smallTalkOf(text: string): SmallTalk | null {
  const trimmed = text.trim();
  if (trimmed !== '' && ONLY_EMOJI.test(trimmed)) return trimmed.includes('🙏') ? 'thanks' : 'ok';
  const said = plainWords(trimmed);
  return SMALL_TALK_SETS.find(([, words]) => words.has(said))?.[0] ?? null;
}

/** The answer a whole message names: a title, or one known word on its own. */
export const exactChoice = (text: string): Choice | undefined => EXACT_MAP.get(plainWords(text));

/** The answer the message is about: exactly, else by a known word in it. */
export function knownChoice(text: string): Choice | undefined {
  const exact = exactChoice(text);
  if (exact) return exact;
  const said = ` ${plainWords(text)} `;
  return KNOWN.find(([, words]) =>
    words.some((word) => said.includes(` ${plainWords(word)} `)),
  )?.[0];
}

/** Words only Marathi or only Hindi uses, to tell the two apart in Devanagari. */
const MARATHI = set(
  list(
    'आहे|आहेत|नाही|नाहीये|काय|कधी|केव्हा|किती|मला|माझे|माझा|माझी|माझ्या|तुम्ही|तुमचे|आणि|झाले|झालं|पाहिजे|कसे|हवे|येणार|करा|सांगा|बरं|पावती|तक्रार',
  ),
);
const HINDI = set(
  list(
    'है|हैं|नहीं|क्या|कब|कितना|कितने|कितनी|मुझे|मेरा|मेरी|मेरे|आप|आपका|और|गया|चाहिए|कैसे|करें|बताएँ|बताइए|शुक्रिया|रसीद|शिकायत',
  ),
);

/**
 * The language of a message in Devanagari: Marathi or Hindi by the words only one of them
 * uses, 'unclear' when it cannot tell, null when the message has no Devanagari at all.
 */
export function scriptLanguage(text: string): 'mr' | 'hi' | 'unclear' | null {
  if (!/\p{Script=Devanagari}/u.test(text)) return null;
  const words = plainWords(text).split(' ');
  const marathi = words.filter((word) => MARATHI.has(word)).length;
  const hindi = words.filter((word) => HINDI.has(word)).length;
  if (marathi === hindi) return 'unclear';
  return marathi > hindi ? 'mr' : 'hi';
}
