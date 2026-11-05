import { describe, expect, it } from 'vitest';
import { SEND_LISTS } from '../../send-to-customer/send-words';
import { VISIT_LISTS } from '../../visits/visit-words';
import { CHAT_LISTS } from './chat-words';

// L1: a home called "Home" must not read "Home home" (en / mr / hi).
describe('home label in customer texts', () => {
  const texts = (home: string) => [
    ...(['en', 'mr', 'hi'] as const).flatMap((lang) => [
      CHAT_LISTS[lang].home.pay('₹100', home),
      CHAT_LISTS[lang].home.paper('Bill', home),
      CHAT_LISTS[lang].home.problem(home),
      CHAT_LISTS[lang].home.visit(home, '5 Nov'),
      SEND_LISTS[lang].location.saved(home),
      SEND_LISTS[lang].pay.due('₹100', home),
      VISIT_LISTS[lang].pick.homeLine(home),
    ]),
  ];

  it('prints "Home" once', () => {
    for (const text of texts('Home')) expect(text).not.toMatch(/home home/iu);
    expect(CHAT_LISTS.en.home.pay('₹100', 'Home')).toBe('*₹100* is due for your home.');
  });

  it('keeps a plain name and a name that already says home', () => {
    expect(CHAT_LISTS.en.home.pay('₹100', 'Farm')).toBe('*₹100* is due for your Farm home.');
    expect(CHAT_LISTS.en.home.pay('₹100', 'Sangli house')).toBe(
      '*₹100* is due for your Sangli house.',
    );
    expect(SEND_LISTS.en.location.saved('Farm home')).toBe(
      'Thank you ✅ Location saved for your Farm home.',
    );
    for (const text of texts('घर')) expect(text).not.toMatch(/घर घर|घरा घर/u);
  });
});
