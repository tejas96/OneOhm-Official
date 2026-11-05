import { describe, expect, it } from 'vitest';
import { JOURNEY_LISTS } from './journey-words';

describe('journey words', () => {
  for (const [language, words] of Object.entries(JOURNEY_LISTS)) {
    it(`${language}: every button title keeps 20 characters`, () => {
      for (const [name, title] of Object.entries(words.buttons))
        expect(title.length, `${language} ${name}`).toBeLessThanOrEqual(20);
    });

    it(`${language}: messages are not empty and fit a WhatsApp body`, () => {
      const texts = [
        words.sign.ask('Net-metering agreement', 'Sangli'),
        words.sign.agreed,
        words.sign.ownOnly('Tejas'),
        words.ready.ask('Sangli'),
        words.ready.notYet,
        words.install.ask('Sangli'),
        words.install.wrong('Sangli'),
        words.pack.summary(4, 'Sangli'),
        words.auto.installStarted('Sangli'),
        words.auto.switchedOn('Sangli', '₹45,000'),
        words.auto.switchedOn('Sangli', null),
        words.auto.needs('Electricity bill'),
        words.auto.waitingOn(words.auto.parties.discom, '2 Nov'),
      ];
      for (const text of texts) {
        expect(text.length).toBeGreaterThan(10);
        expect(text.length).toBeLessThanOrEqual(1024);
      }
    });
  }

  it('Marathi and Hindi differ from English', () => {
    expect(JOURNEY_LISTS.mr.buttons.agree).not.toBe(JOURNEY_LISTS.en.buttons.agree);
    expect(JOURNEY_LISTS.hi.sign.ownOnly('Tejas')).not.toBe(JOURNEY_LISTS.en.sign.ownOnly('Tejas'));
  });

  it('the own-number refusal names the customer', () => {
    expect(JOURNEY_LISTS.en.sign.ownOnly('Tejas')).toBe(
      "Only Tejas's own number can agree to this.",
    );
  });
});
