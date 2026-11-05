import { formatInr } from '@oneohm/shared';
import type { AssistantLanguage } from '../whatsapp/assistant/language';

/**
 * The SMS texts for a customer who is not on WhatsApp (redesign §17). Each is a DLT template the owner
 * registers (see docs/whatsapp-templates.md, "SMS texts"); the company name is added after them.
 */
interface OffWords {
  readonly paper: { readonly title: string; readonly body: string };
  readonly rating: { readonly title: string; readonly body: string };
  readonly payLink: (amount: string, home: string, url: string) => { title: string; body: string };
}

const WORDS: Record<AssistantLanguage, OffWords> = {
  en: {
    paper: {
      title: 'We need a paper from you',
      body: 'Please send it from the OneOhm app, or give it to our team.',
    },
    rating: {
      title: 'How did we do?',
      body: 'Please rate us in the OneOhm app, or tell our team.',
    },
    payLink: (amount, home, url) => ({
      title: `Payment due ${amount} for ${home}`,
      body: `Pay here: ${url}`,
    }),
  },
  mr: {
    paper: {
      title: 'आम्हाला तुमचा एक कागद हवा आहे',
      body: 'कृपया तो OneOhm ॲपवरून पाठवा, किंवा आमच्या टीमकडे द्या.',
    },
    rating: {
      title: 'आमचे काम कसे वाटले?',
      body: 'कृपया OneOhm ॲपमध्ये रेटिंग द्या, किंवा आमच्या टीमला सांगा.',
    },
    payLink: (amount, home, url) => ({
      title: `${home}: ${amount} भरायचे आहेत`,
      body: `इथे भरा: ${url}`,
    }),
  },
  hi: {
    paper: {
      title: 'हमें आपका एक कागज़ चाहिए',
      body: 'कृपया उसे OneOhm ऐप से भेजें, या हमारी टीम को दें।',
    },
    rating: {
      title: 'हमारा काम कैसा लगा?',
      body: 'कृपया OneOhm ऐप में रेटिंग दें, या हमारी टीम को बताएँ।',
    },
    payLink: (amount, home, url) => ({
      title: `${home}: ${amount} देने हैं`,
      body: `यहाँ भरें: ${url}`,
    }),
  },
};

export const offWords = (language: AssistantLanguage) => WORDS[language];
export const amountWords = (paise: number) => formatInr(paise);
