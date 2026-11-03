import { describe, expect, it } from 'vitest';
import { inLanguage } from '../whatsapp/assistant/language';
import { payPage } from './due-pay.controller';
import { PAY_PAGE_WORDS } from './due-pay-words';

describe('the pay landing page', () => {
  it('asks search engines and link checkers not to index it or follow Continue', () => {
    const html = payPage('<p>Pay</p>', true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('<a class="go" href="?go=1" rel="nofollow">Continue to pay</a>');
  });

  it('speaks the customer’s language: Marathi and Hindi, every line', async () => {
    const mr = await inLanguage('mr', async () => payPage('<p>x</p>', true));
    expect(mr).toContain('<html lang="mr">');
    expect(mr).toContain('पेमेंट करा');
    const hi = await inLanguage('hi', async () => PAY_PAGE_WORDS.ask('₹100', 'Advance'));
    expect(hi).toContain('भुगतान');
    for (const language of ['mr', 'hi'] as const) {
      const codes = await inLanguage(language, async () => Object.keys(PAY_PAGE_WORDS.byCode));
      expect(codes.sort()).toEqual(['bank_share', 'not_due', 'off', 'paid']);
    }
  });
});
