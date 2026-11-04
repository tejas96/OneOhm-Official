import { describe, expect, it } from 'vitest';
import { SEND_LISTS } from './send-words';

describe('send-to-customer words', () => {
  for (const [language, words] of Object.entries(SEND_LISTS)) {
    it(`${language}: every button title keeps 20 characters`, () => {
      for (const [name, title] of Object.entries(words.buttons))
        expect(title.length, `${language} ${name}`).toBeLessThanOrEqual(20);
    });

    it(`${language}: messages fit a WhatsApp body and are not empty`, () => {
      const texts = [
        words.location.ask('Sangli'),
        words.location.saved('Sangli'),
        words.location.checking('Sangli'),
        words.pay.due('₹45,000', 'Sangli'),
        words.pay.askProof('₹45,000', 'Sangli'),
        words.callback.ask('Priya'),
        words.callback.thanks('Priya', words.callback.slots.morning),
        words.crew('Ravi', 'installation', '+919800000001'),
        words.delay('Net meter', 'the electricity board'),
      ];
      for (const text of texts) {
        expect(text.length).toBeGreaterThan(10);
        expect(text.length).toBeLessThanOrEqual(1024);
      }
    });
  }

  it('Marathi and Hindi differ from English', () => {
    expect(SEND_LISTS.mr.location.which).not.toBe(SEND_LISTS.en.location.which);
    expect(SEND_LISTS.hi.buttons.paidOther).not.toBe(SEND_LISTS.en.buttons.paidOther);
  });
});
