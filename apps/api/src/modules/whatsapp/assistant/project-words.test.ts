import { describe, expect, it } from 'vitest';
import { inLanguage } from './language';
import { PROJECT_LISTS, PROJECT_WORDS } from './project-words';

describe('the customer’s words for a project (live review C9)', () => {
  it('names the project by its town, the size in panels and the instalments in order', () => {
    expect(PROJECT_WORDS.projectIn('Sangli')).toBe('Your solar project in Sangli');
    expect(PROJECT_WORDS.size(6, 3270)).toBe('6 panels (3.27 kW)');
    expect([0, 1, 2].map((index) => PROJECT_WORDS.instalment(index, 3))).toEqual([
      '1st instalment',
      '2nd instalment',
      'Last instalment',
    ]);
    expect(PROJECT_WORDS.instalment(2, 4)).toBe('3rd instalment');
  });

  it('says it in Marathi and Hindi, with no project codes', async () => {
    const mr = await inLanguage('mr', async () => [
      PROJECT_WORDS.projectIn('Sangli'),
      PROJECT_WORDS.size(6, 3270),
      PROJECT_WORDS.instalment(0, 3),
      PROJECT_WORDS.instalment(2, 3),
    ]);
    expect(mr).toEqual([
      'Sangli येथील तुमचा सोलर प्रकल्प',
      '6 पॅनल (3.27 kW)',
      'पहिला हप्ता',
      'शेवटचा हप्ता',
    ]);
    const hi = await inLanguage('hi', async () => PROJECT_WORDS.instalment(1, 3));
    expect(hi).toBe('दूसरी किस्त');
    for (const words of [PROJECT_LISTS.mr, PROJECT_LISTS.hi])
      expect(Object.keys(words).sort()).toEqual(Object.keys(PROJECT_LISTS.en).sort());
  });

  it('tells what happens after each payment, with a named person and a phone', () => {
    for (const [language, words] of Object.entries(PROJECT_LISTS)) {
      const said = words.paidNext('quotation_accepted', 'Priya Kulkarni', '+919800000001');
      expect(said, language).toContain('Priya Kulkarni');
      expect(said, language).toContain('+919800000001');
      expect(words.paidNext('commissioning_completed', null, null), language).not.toContain('null');
      expect(said.length, language).toBeLessThanOrEqual(1024);
    }
    expect(PROJECT_LISTS.en.paidNext('quotation_accepted', 'Priya', '+919800000001')).toBe(
      'Thank you, your payment is received. Next: a site visit to plan your system. Your contact: Priya, +919800000001.',
    );
  });
});
