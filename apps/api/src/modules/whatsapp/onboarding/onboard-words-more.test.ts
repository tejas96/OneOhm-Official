import { describe, expect, it } from 'vitest';
import { MORE_LISTS } from './onboard-words-more';

describe('the onboarding words of phase 7', () => {
  it('fit WhatsApp in every language and are really translated', () => {
    for (const [language, words] of Object.entries(MORE_LISTS)) {
      for (const title of [words.bookVisit, words.callMe, words.quickEstimate])
        expect(title.length, `${language} ${title}`).toBeLessThanOrEqual(20);
      expect(words.sendLocation.length, `${language} pin`).toBeLessThanOrEqual(24);
      for (const text of [
        words.locationAsk,
        words.pinNoCity,
        words.nameAgain,
        words.afterEstimate,
        words.visitDay,
        words.visitSlot('Thu 6 Nov'),
        words.visitNone('Asha'),
        words.visitDone('Asha', '6:30 pm today'),
        words.leadHello('Suresh', 'Priya'),
        words.fileKept,
      ]) {
        expect(text.length, `${language} ${text}`).toBeGreaterThan(0);
        expect(text.length, `${language} ${text}`).toBeLessThanOrEqual(1024);
      }
      if (language !== 'en') {
        expect(words.afterEstimate).not.toBe(MORE_LISTS.en.afterEstimate);
        expect(words.leadHello('A', null)).not.toBe(MORE_LISTS.en.leadHello('A', null));
      }
    }
  });

  it('names the owner in the hello, or the team when nobody owns the lead', () => {
    expect(MORE_LISTS.en.leadHello('Suresh', 'Priya')).toBe(
      'Hi Suresh 👋 Priya from OneOhm is helping you.',
    );
    expect(MORE_LISTS.en.leadHello('Suresh', null)).toBe(
      'Hi Suresh 👋 Our team at OneOhm is helping you.',
    );
    expect(MORE_LISTS.en.talkTo('Priya')).toBe('Talk to Priya');
  });
});
