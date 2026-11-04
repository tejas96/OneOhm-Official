import { describe, expect, it } from 'vitest';
import { QUOTE_LISTS } from './quote-words';

describe('the thank-you after the customer accepts a quote', () => {
  it('promises the project manager and the advance link today or the next working day', () => {
    expect(QUOTE_LISTS.en.quoteThanks).toBe(
      'Thank you. Your project manager will start your project and send the advance payment link today (or the next working day).',
    );
    for (const [language, words] of Object.entries(QUOTE_LISTS)) {
      // A WhatsApp text holds 4096 characters; each language says it in its own words.
      expect(words.quoteThanks.length, language).toBeLessThanOrEqual(4096);
      if (language !== 'en')
        expect(words.quoteThanks, language).not.toBe(QUOTE_LISTS.en.quoteThanks);
    }
    expect(QUOTE_LISTS.mr.quoteThanks).toContain('प्रोजेक्ट मॅनेजर');
    expect(QUOTE_LISTS.hi.quoteThanks).toContain('प्रोजेक्ट मैनेजर');
  });

  it('says a quote already accepted is accepted, in every language (menu audit H4)', () => {
    expect(QUOTE_LISTS.en.alreadyAccepted).toBe('This quote is already accepted. Thank you!');
    expect(QUOTE_LISTS.mr.alreadyAccepted).not.toBe(QUOTE_LISTS.en.alreadyAccepted);
    expect(QUOTE_LISTS.hi.alreadyAccepted).not.toBe(QUOTE_LISTS.en.alreadyAccepted);
  });
});
