import { describe, expect, it } from 'vitest';
import { assistantLanguage, inLanguage } from './language';
import { EN, MEDIA_WORDS, MENU_ROWS, RATINGS, WORDS } from './words';
import { HI } from './words-hi';
import { MR } from './words-mr';

const LISTS = { en: EN, mr: MR, hi: HI };

describe('assistant words in three languages', () => {
  it('answers in the language of the message being handled', async () => {
    expect(await inLanguage('mr', async () => WORDS.menuButton)).toBe('निवडा');
    expect(await inLanguage('hi', async () => MENU_ROWS[0]?.title)).toBe('प्रोजेक्ट की प्रगति');
    expect(await inLanguage('en', async () => WORDS.menuButton)).toBe('Choose');
    expect(WORDS.menuButton).toBe('Choose');
  });

  it('keeps the same menu choices, in the same order, in every language', () => {
    for (const words of [MR, HI])
      expect(words.MENU_ROWS.map((row) => row.id)).toEqual(EN.MENU_ROWS.map((row) => row.id));
  });

  // WhatsApp refuses a list row title over 24, a description over 72, a button over 20.
  it('fits WhatsApp’s limits in every language', () => {
    for (const [language, words] of Object.entries(LISTS)) {
      for (const row of [...words.MENU_ROWS, ...words.RATINGS]) {
        expect(row.title.length, `${language} ${row.title}`).toBeLessThanOrEqual(24);
        expect(row.description.length, `${language} ${row.description}`).toBeLessThanOrEqual(72);
      }
      for (const button of [
        words.WORDS.payNow,
        words.WORDS.callMeBack,
        words.WORDS.menuButton,
        words.WORDS.quoteYes,
        words.WORDS.quoteNotYet,
        words.MEDIA_WORDS.reportProblem,
        words.MEDIA_WORDS.talkToPerson,
      ])
        expect(button.length, `${language} ${button}`).toBeLessThanOrEqual(20);
    }
  });

  it('picks the customer’s saved language', () => {
    expect(assistantLanguage('mr-IN')).toBe('mr');
    expect(assistantLanguage('hi-IN')).toBe('hi');
    expect(assistantLanguage('en-IN')).toBe('en');
    expect(assistantLanguage(null)).toBe('en');
  });

  it('is a working list in Marathi for ratings and media', async () => {
    await inLanguage('mr', async () => {
      expect(RATINGS.map((rating) => rating.id)).toEqual(EN.RATINGS.map((rating) => rating.id));
      expect(MEDIA_WORDS.ask('फोटो')).toContain('फोटो');
    });
  });
});

describe('hand-over and night words', () => {
  it('names the person in every language, and falls back to the team', () => {
    for (const words of [EN, MR, HI]) {
      expect(words.WORDS.passedToOwner('Asha')).toContain('Asha');
      expect(words.WORDS.nightReply('Asha')).toContain('Asha');
      expect(words.WORDS.passedToOwner(null)).not.toContain('null');
      expect(words.WORDS.nightReply(null)).not.toContain('null');
    }
  });
});
