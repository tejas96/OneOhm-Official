import { SMS_MAX, smsText } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { offWords } from './send-off-words';

describe('the SMS texts for a customer not on WhatsApp', () => {
  it('exist in English, Marathi and Hindi and fit one signed SMS', () => {
    for (const language of ['en', 'mr', 'hi'] as const) {
      const words = offWords(language);
      const pay = words.payLink('₹45,000', 'Pune home', 'https://example.test/v1/pay/due/abc');
      for (const said of [words.paper, words.rating, pay]) {
        expect(said.title.length).toBeGreaterThan(0);
        expect(smsText(said.title, said.body, 'OneOhm').length).toBeLessThanOrEqual(SMS_MAX);
      }
      expect(pay.body).toContain('https://example.test/v1/pay/due/abc');
    }
    expect(offWords('mr').paper.body).not.toBe(offWords('en').paper.body);
    expect(offWords('hi').rating.body).not.toBe(offWords('en').rating.body);
  });
});
