/**
 * Marathi copy for rating each finished stage: the same shape as `../en/ratings.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/ratings';

export const STAGE_RATING: Copy<typeof en.STAGE_RATING> = {
  stage: {
    survey: 'साईट भेट',
    installation: 'पॅनल बसवण्याचे काम',
    commissioning: 'सिस्टिम सुरू करणे आणि ताब्यात देणे',
  },
  cardTitle: (stage) => `${stage}: तुमचा अनुभव कसा होता?`,
  cardBody: (project) => `${project} · काही सेकंद लागतील.`,
  cardAction: 'रेट करा',
  screenTitle: (stage) => `${stage}: रेटिंग द्या`,
  intro: 'तुमचे स्टार काम केलेल्या टीमला मिळतात. तुमच्या प्रकल्पाला फक्त तुम्हीच रेट करू शकता.',
  overall: 'एकूण',
  stars: ['खराब', 'अजून चांगले हवे', 'चांगले', 'खूप चांगले', 'उत्कृष्ट'],
  pick: 'आधी रेटिंग निवडा.',
  comment: 'अजून सांगा',
  commentHint: 'काय चांगले झाले, आणि आम्ही काय अजून चांगले करू शकलो असतो?',
  commentNeeded: 'काय चुकले ते कृपया सांगा.',
  people: 'काम केलेले लोक',
  peopleHint: 'हवे असल्यास. ज्यांना भेटलात त्यांना रेट करा.',
  crew: (name) => `${name} टीम`,
  submit: 'रेटिंग पाठवा',
  sent: 'धन्यवाद. टीमला हे दिसेल.',
};
