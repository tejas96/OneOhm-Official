import { routeFor } from '@oneohm/domain';

// What the app inbox says to a customer who is not on WhatsApp (by SMS or in person): the words
// written for the chat ("We sent it on WhatsApp", "Open our WhatsApp chat") would send them to a
// chat they do not have, so the app's own words stand in their place.

type Lang = 'en' | 'mr' | 'hi';

/** Any message that points to the chat: open the app or call us. */
const OPEN_APP: Readonly<Record<Lang, string>> = {
  en: 'Please open the OneOhm app or call us.',
  mr: 'कृपया OneOhm ॲप उघडा किंवा आम्हाला फोन करा.',
  hi: 'कृपया OneOhm ऐप खोलें या हमें फ़ोन करें।',
};

/** A message with something better to say: where the paper is. */
const OWN_WORDS: Readonly<Record<string, Readonly<Record<Lang, string>>>> = {
  document_share: {
    en: 'It is in Documents.',
    mr: 'ते ‘कागदपत्रे’ मध्ये आहे.',
    hi: 'यह ‘दस्तावेज़’ में है।',
  },
};

const langOf = (language?: string | null): Lang => {
  const code = (language ?? 'en').slice(0, 2);
  return code === 'mr' || code === 'hi' ? code : 'en';
};

/** The words for a customer who is not on WhatsApp: unchanged unless they mention the chat. */
export function appWords<T extends { readonly title: string; readonly body: string }>(
  template: string,
  words: T,
  language?: string | null,
): T {
  if (!/WhatsApp/u.test(words.body)) return words;
  const lang = langOf(language);
  return { ...words, body: (OWN_WORDS[template] ?? OPEN_APP)[lang] };
}

/** Whether the customer is reached off WhatsApp (their setting, a rejected number, STOP). */
export const offWhatsApp = (customer: {
  readonly contactChannel: Parameters<typeof routeFor>[0]['channel'];
  readonly whatsappUnreachableAt: Date | null;
  readonly whatsappOptIn: boolean;
}): boolean =>
  routeFor({
    channel: customer.contactChannel,
    whatsappUnreachable: customer.whatsappUnreachableAt !== null,
    whatsappOptIn: customer.whatsappOptIn,
  }) !== 'whatsapp';
