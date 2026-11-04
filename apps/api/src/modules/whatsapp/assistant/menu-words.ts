import type { MenuChoice } from './words';

/**
 * Plain words a customer may type for the menu or one of its main answers, in English,
 * Marathi and Hindi (live review C5), besides the menu rows' own titles. Only the whole
 * message counts, so "inverter बंद आहे" is never read as a menu word.
 */
const WORDS: Record<MenuChoice | 'menu', readonly string[]> = {
  menu: ['menu', 'मेनू', 'मेन्यू', 'मेनु', 'मेन्यु', 'मेन्यूं'],
  progress: ['progress', 'project', 'status', 'प्रगती', 'प्रगति', 'प्रकल्प', 'प्रोजेक्ट', 'काम'],
  payments: ['payment', 'payments', 'pay', 'पेमेंट', 'पैसे', 'हप्ता', 'भुगतान', 'किस्त'],
  documents: [
    'documents',
    'document',
    'papers',
    'receipt',
    'कागद',
    'कागदपत्र',
    'कागदपत्रे',
    'पावती',
    'दस्तावेज़',
    'दस्तावेज',
    'कागज़',
    'रसीद',
  ],
  service: ['problem', 'complaint', 'तक्रार', 'समस्या', 'शिकायत'],
  requests: ['requests', 'विनंती', 'विनंत्या', 'अनुरोध'],
  warranty: ['warranty', 'amc', 'वॉरंटी', 'वारंटी'],
  refer: ['refer', 'referral'],
  rewards: ['rewards', 'reward', 'बक्षीस', 'इनाम'],
  feedback: ['feedback', 'rating', 'रेटिंग'],
  human: ['help', 'मदत', 'मदद'],
};

const BY_WORD = new Map(
  Object.entries(WORDS).flatMap(([choice, words]) => words.map((word) => [word, choice] as const)),
);

/** The menu ("menu") or the menu choice a typed word means, or undefined. */
export function menuWordChoice(text: string): MenuChoice | 'menu' | undefined {
  return BY_WORD.get(
    text
      .trim()
      .toLowerCase()
      .replace(/[.!?]+$/u, ''),
  ) as MenuChoice | 'menu' | undefined;
}
