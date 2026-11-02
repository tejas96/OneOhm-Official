/**
 * First messages the customer app puts in WhatsApp for the customer to send to the
 * business number. The assistant reads them in every language: "talk to a person" goes
 * straight to the team, a hello shows the menu.
 */
export const CHAT_OPENERS = {
  talkToPerson: {
    en: 'Talk to a person',
    mr: 'मला टीमशी बोलायचे आहे',
    hi: 'मुझे टीम से बात करनी है',
  },
  hello: { en: 'Hi', mr: 'नमस्कार', hi: 'नमस्ते' },
} as const;

/** Lower-case, trimmed, without the full stop people add, for matching what they sent. */
export const chatWord = (text: string) =>
  text
    .trim()
    .replace(/[.!।]+$/u, '')
    .toLowerCase();

const all = (opener: Record<string, string>) => Object.values(opener).map(chatWord);

/** True when the message is one of the "talk to a person" openers, in any language. */
export const asksForPerson = (text: string) =>
  all(CHAT_OPENERS.talkToPerson).includes(chatWord(text));

/** True when the message is one of the hello openers, in any language. */
export const saysHello = (text: string) => all(CHAT_OPENERS.hello).includes(chatWord(text));
