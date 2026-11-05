import { describe, expect, it } from 'vitest';
import { QUOTE_LISTS } from './quote-words';

describe('the thank-you after the customer accepts a quote', () => {
  it('names who starts the project and sends the advance link today or the next working day', () => {
    expect(QUOTE_LISTS.en.quoteThanks('Priya')).toBe(
      'Thank you ✅ Priya will start your project and send the advance payment link today (or the next working day).',
    );
    for (const [language, words] of Object.entries(QUOTE_LISTS)) {
      expect(words.quoteThanks('Priya'), language).toContain('Priya');
      expect(words.ownerOnly('Tejas'), language).toContain('Tejas');
      if (language !== 'en')
        expect(words.quoteThanks('Priya'), language).not.toBe(QUOTE_LISTS.en.quoteThanks('Priya'));
    }
  });

  it('says a quote already accepted is accepted, in every language (menu audit H4)', () => {
    expect(QUOTE_LISTS.en.alreadyAccepted).toBe('This quote is already accepted. Thank you!');
    expect(QUOTE_LISTS.mr.alreadyAccepted).not.toBe(QUOTE_LISTS.en.alreadyAccepted);
    expect(QUOTE_LISTS.hi.alreadyAccepted).not.toBe(QUOTE_LISTS.en.alreadyAccepted);
  });
});
