import { describe, expect, it } from 'vitest';
import { isPaperTap, paperTap } from './customer-papers';
import { inLanguage } from './language';
import { PAPER_LISTS, PAPER_WORDS, ROW_TITLE_LIMIT } from './paper-words';
import { PROJECT_LISTS } from './project-words';

const id = '0b6f2f9e-6c1a-4f43-9d55-3f3c2a1b7e10';

describe('the Documents list (live QA round 2)', () => {
  it('names every paper in plain words that fit a list row, in every language', async () => {
    for (const [language, words] of Object.entries(PAPER_LISTS)) {
      const instalments = PROJECT_LISTS[language as 'en'];
      const titles = [
        words.quote,
        words.invoice,
        words.plainReceipt,
        words.back,
        words.receipt(instalments.instalment(0, 3)),
        words.receipt(instalments.instalment(2, 3)),
        words.receipt(instalments.bankShare),
        words.paper('A very long paper title from the office team'),
      ];
      for (const title of titles)
        expect(title.length, `${language} ${title}`).toBeLessThanOrEqual(ROW_TITLE_LIMIT);
      expect(words.button.length, words.button).toBeLessThanOrEqual(20);
    }
    expect(PAPER_WORDS.receipt('1st instalment')).toBe('Receipt · 1st instalment');
    expect(PAPER_WORDS.receipt('Last instalment')).toBe('Last instalment receipt');
    expect(await inLanguage('mr', async () => PAPER_WORDS.receipt('पहिला हप्ता'))).toBe(
      'पावती · पहिला हप्ता',
    );
  });

  it('reads a paper row tap, a report by its key too', () => {
    expect(paperTap('receipt', id)).toBe(`paper:receipt:${id}`);
    expect(isPaperTap(paperTap('receipt', id))).toBe(true);
    expect(isPaperTap(paperTap('report', id, 'net-metering-agreement'))).toBe(true);
    expect(isPaperTap(`paper:estimate:${id}`)).toBe(false);
    expect(isPaperTap('paper:receipt:1')).toBe(false);
    expect(isPaperTap(null)).toBe(false);
  });
});
