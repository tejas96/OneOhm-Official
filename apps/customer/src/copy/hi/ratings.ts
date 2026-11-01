/**
 * Hindi copy for rating each finished stage: the same shape as `../en/ratings.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/ratings';

export const STAGE_RATING: Copy<typeof en.STAGE_RATING> = {
  stage: {
    survey: 'साइट विज़िट',
    installation: 'पैनल लगाने का काम',
    commissioning: 'सिस्टम चालू करना और सौंपना',
  },
  cardTitle: (stage) => `${stage}: आपका अनुभव कैसा रहा?`,
  cardBody: (project) => `${project} · बस कुछ सेकंड लगेंगे।`,
  cardAction: 'रेटिंग दें',
  screenTitle: (stage) => `${stage}: रेटिंग दें`,
  intro: 'आपके स्टार काम करने वाली टीम को मिलते हैं। आपके प्रोजेक्ट को सिर्फ़ आप ही रेटिंग दे सकते हैं।',
  overall: 'कुल मिलाकर',
  stars: ['खराब', 'और अच्छा हो सकता था', 'अच्छा', 'बहुत अच्छा', 'शानदार'],
  pick: 'पहले रेटिंग चुनें।',
  comment: 'और बताएँ',
  commentHint: 'क्या अच्छा रहा, और हम क्या बेहतर कर सकते थे?',
  commentNeeded: 'कृपया बताएँ कि क्या गलत हुआ।',
  people: 'काम करने वाले लोग',
  peopleHint: 'ज़रूरी नहीं। जिनसे मिले, उन्हें रेटिंग दें।',
  crew: (name) => `${name} टीम`,
  submit: 'रेटिंग भेजें',
  sent: 'धन्यवाद। टीम इसे देखेगी।',
};
