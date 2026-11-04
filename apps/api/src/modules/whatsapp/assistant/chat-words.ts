import type { ReplyTime } from '@oneohm/domain';
import { HI_CHAT } from './chat-words-hi';
import { MR_CHAT } from './chat-words-mr';
import { localized } from './language';

/**
 * The one dictionary for a known customer's chat (redesign §3, §14; principles §6): every
 * button and list title, the Home lines and the short replies, in the "we" voice. Buttons
 * keep 20 characters, list rows 24 and their descriptions 72, in all three languages
 * (chat-words.test.ts checks every one).
 */
const EN_CHAT = {
  buttons: {
    menu: 'Menu',
    more: 'More',
    update: 'Project update',
    payments: 'Payments',
    documents: 'Documents',
    problem: 'Report a problem',
    problems: 'My problems',
    seeThem: 'See them',
    sendItNow: 'Send it now',
    visit: 'Visit details',
    problemUpdate: 'Problem update',
    quote: 'See quotation',
    receipts: 'Receipts',
    refer: 'Refer a friend',
    rewards: 'My rewards',
    talkTeam: 'Talk to our team',
    sendBill: 'Send bill photo',
    invoice: 'Our invoice',
    start: 'Start again',
    viewReceipt: 'View receipt',
  },
  /** "Pay ₹45,000": a reply button; its tap answers with the pay-link message. */
  pay: (amount: string) => `Pay ${amount}`,
  /** The pay-link message (one button, redesign §1): what is due, when, for which home. */
  payLink: (amount: string, when: string, home: string) =>
    `*${amount}* is due ${when ? `${when} ` : ''}for your ${home} home.`,
  /** Under the second Payments message when a third home also owes. */
  moreDue: (count: number) =>
    count === 1
      ? '1 more home has a payment due. Ask us here for it.'
      : `${count} more homes have a payment due. Ask us here for them.`,
  /** [See quotation] on a quote that is no longer open. */
  quoteChanged: 'That quotation has changed — here is the latest.',
  /** "Talk to Priya"; too long for a title, it is "Talk to our team" (talk-title.ts). */
  talkTo: (name: string) => `Talk to ${name}`,
  /** Over the taps when an answer is too long for one buttons message. */
  whatNext: 'What next?',
  listButton: 'Choose',
  /** The More list (redesign §3): titles and short help lines. */
  more: {
    body: 'What can we help with?',
    rows: {
      update: { title: 'Project update', description: 'Where your solar work stands' },
      payments: { title: 'Payments', description: 'Paid, due and pay online' },
      documents: { title: 'Documents', description: 'Quotation, receipts and invoices' },
      paper: { title: 'Send a paper', description: 'Send us a photo or PDF we need' },
      problem: { title: 'Report a problem', description: 'Tell us what is wrong' },
      problems: { title: 'My problems', description: 'How your problems are going' },
      warranty: { title: 'Warranty & AMC', description: 'Your cover and check-up visits' },
      refer: { title: 'Refer a friend', description: 'Earn a reward for each friend' },
      talk: { title: 'Talk to our team', description: 'Replies here, Mon–Sat 9:30–6:30' },
      language: { title: 'Language', description: 'English, मराठी, हिंदी' },
    },
  },
  /** Home: "Hi Tejas 👋" and one line of what matters now (redesign §3). */
  home: {
    hello: (name: string) => (name ? `Hi ${name} 👋` : 'Hi 👋'),
    stage: (home: string, stage: string, done: number, steps: number) =>
      `Your ${home} solar is at *${stage}* (${done} of ${steps} steps).`,
    complete: (home: string) => `Your ${home} solar is complete.`,
    paper: (paper: string, home: string | null) =>
      `We need your *${paper}*${home ? ` for your ${home} home` : ''}.`,
    pay: (amount: string, home: string) => `*${amount}* is due for your ${home} home.`,
    visit: (home: string | null, day: string) =>
      `Our team visits your ${home ? `${home} ` : ''}home on *${day}*.`,
    problem: (home: string | null) =>
      `We are working on your problem${home ? ` at your ${home} home` : ''}.`,
    quote: 'Your quotation is waiting for your answer.',
    nothing: 'How can we help today?',
    count: (count: number) => `${count} things need you.`,
    noProject: (name: string | null, when: ReplyTime) =>
      `We are preparing your solar plan. ${name ?? 'Our team'} will call you ${EN_CALL[when]}.`,
    seeThem: 'Here is what needs you now.',
    paperRow: (home: string | null) =>
      home ? `We need it for your ${home} home` : 'We need it from you',
    payRow: (home: string) => `Due for your ${home} home`,
    quoteRow: 'Waiting for your answer',
  },
  /** "ok", "thanks", 👍, "good morning": a short reply, no buttons (redesign §14). */
  smallTalk: {
    thanks: 'You’re welcome 🙏',
    ok: 'Great 👍',
    morning: 'Good morning 🙏',
    evening: 'Good evening 🙏',
    night: 'Good night 🙏',
  },
  unknown: 'Sorry, we didn’t get that. Pick one below.',
  /** Talk to Priya: who replies and when, said every time (principles §5). */
  talkReply: (name: string | null, when: ReplyTime) =>
    `${name ?? 'Our team'} will reply ${EN_WHEN[when]}.`,
  /** Words for their person (a reply to our update, a quote question). */
  passed: (name: string | null, when: ReplyTime) =>
    `Thank you. We’ve passed this to ${name ?? 'our team'}, who will reply ${EN_WHEN[when]}.`,
  /** The second message in a row we did not understand. */
  passedUnknown: (name: string | null, when: ReplyTime) =>
    `Sorry, we still didn’t get that. We’ve passed your message to ${name ?? 'our team'}, who will reply ${EN_WHEN[when]}.`,
  /** Once a night, outside working hours, while a person has the chat. */
  nightReply: (name: string | null, when: ReplyTime) =>
    `Thank you. Your message is with ${name ?? 'our team'}, who will reply ${EN_WHEN[when]}.`,
  handedBack: (name: string | null) => `${name ?? 'Our team'} is away now — we’re here to help.`,
  earlier: 'That was an earlier message — here is the latest.',
  /** A typed "bill": their electricity bill we need, our invoice, or what they owe? */
  bill: { ask: 'Which bill do you mean?', paper: 'electricity bill' },
  language: {
    ask: 'Which language would you like us to write in?',
    saved: 'Done ✅ We will write in English now.',
  },
  /** "Send a paper" and [Send it now]: the paper path of today (photo or PDF here). */
  paper: {
    ask: (paper: string, home: string | null) =>
      `Please send your *${paper}*${home ? ` for your ${home} home` : ''} here as a photo or PDF.`,
    list: (papers: string) => `We still need: ${papers}.\nSend the photo or PDF here.`,
    any: 'Send the photo or PDF here and tell us what it is.',
  },
};

const EN_WHEN: Record<ReplyTime, string> = {
  now: 'here soon (Mon–Sat, 9:30–6:30)',
  today: 'here today from 9:30',
  tomorrow: 'here tomorrow from 9:30',
  monday: 'here on Monday from 9:30',
};

const EN_CALL: Record<ReplyTime, string> = {
  now: 'today',
  today: 'today',
  tomorrow: 'tomorrow',
  monday: 'on Monday',
};

export type ChatWords = typeof EN_CHAT;

/** Every language, for the checks. */
export const CHAT_LISTS = { en: EN_CHAT, mr: MR_CHAT, hi: HI_CHAT };
export const CHAT_WORDS = localized(EN_CHAT, { mr: MR_CHAT, hi: HI_CHAT });

/** The language buttons read the same in every language. */
export const LANGUAGE_BUTTONS = [
  { id: 'lang:en', title: 'English' },
  { id: 'lang:mr', title: 'मराठी' },
  { id: 'lang:hi', title: 'हिंदी' },
] as const;

/** WhatsApp's limits: a reply button's title, a list row's title, a row's description. */
export const BUTTON_MAX = 20;
export const ROW_MAX = 24;
export const DESCRIPTION_MAX = 72;

/**
 * "Talk to Priya" in the language being spoken, with the first name only; when that does
 * not fit (`max`: 20 for a button, 24 for a row), "Talk to our team".
 */
export function talkTitle(name: string | null, max = BUTTON_MAX): string {
  const first = name?.trim().split(/\s+/)[0];
  const title = first ? CHAT_WORDS.talkTo(first) : '';
  return title && title.length <= max ? title : CHAT_WORDS.buttons.talkTeam;
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * A title cut to fit, with "…" when it was longer. It is cut between whole letters, never
 * inside one (a Devanagari letter with its vowel sign stays together).
 */
export function fitTitle(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = '';
  for (const { segment } of graphemes.segment(text)) {
    if (cut.length + segment.length > max - 1) break;
    cut += segment;
  }
  return `${cut}…`;
}
