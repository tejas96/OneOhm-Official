import { describe, expect, it } from 'vitest';
import { STEP_LISTS } from './step-words';

describe('step words', () => {
  for (const [language, words] of Object.entries(STEP_LISTS)) {
    it(`${language}: every button title keeps 20 characters`, () => {
      for (const [name, title] of Object.entries(words.buttons))
        expect(title.length, `${language} ${name}`).toBeLessThanOrEqual(20);
    });

    it(`${language}: messages are not empty and fit a WhatsApp body`, () => {
      const texts = [
        words.register.ask('Sangli'),
        words.register.done,
        words.credit.ask('₹78,000', 'Sangli'),
        words.credit.notYet,
        words.bank.ask('HDFC Bank', 'Sangli main branch', 'Thu 6 Nov'),
        words.bank.going('Thu 6 Nov'),
        words.bank.change,
        words.layout.ask('Sangli'),
        words.layout.ok,
        words.loan.sanctioned('₹2,00,000', 'HDFC Bank'),
        words.loan.disbursed('₹1,00,000', 'HDFC Bank'),
        words.loan.rejected('HDFC Bank', 'Priya'),
      ];
      for (const text of texts) {
        expect(text.length).toBeGreaterThan(10);
        expect(text.length).toBeLessThanOrEqual(1024);
      }
    });
  }

  it('says the amount, the bank and the day, and the "we" voice never says I', () => {
    const en = STEP_LISTS.en;
    expect(en.credit.ask('₹78,000', 'Sangli')).toContain('₹78,000');
    expect(en.bank.ask('HDFC Bank', 'Main branch', 'Thu 6 Nov')).toContain(
      'HDFC Bank, Main branch',
    );
    expect(en.register.ask('Sangli')).toContain('pmsuryaghar.gov.in');
    expect(en.bank.change).not.toMatch(/\bI\b/);
  });

  it('Marathi and Hindi differ from English', () => {
    expect(STEP_LISTS.mr.buttons.done).not.toBe(STEP_LISTS.en.buttons.done);
    expect(STEP_LISTS.hi.layout.ok).not.toBe(STEP_LISTS.en.layout.ok);
  });
});
