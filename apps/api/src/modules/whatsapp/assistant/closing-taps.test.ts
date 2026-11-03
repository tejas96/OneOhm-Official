import { describe, expect, it } from 'vitest';
import { TAP_LISTS, TAP_WORDS, withTaps } from './closing-taps';
import { inLanguage } from './language';
import { menuWordChoice } from './menu-words';

describe('the taps that end every bot message (live review C5)', () => {
  it('fits WhatsApp’s 20-character buttons in every language', () => {
    for (const [language, words] of Object.entries(TAP_LISTS))
      for (const [key, title] of Object.entries(words))
        if (key !== 'whatNext')
          expect(title.length, `${language} ${title}`).toBeLessThanOrEqual(20);
    for (const words of [TAP_LISTS.mr, TAP_LISTS.hi])
      expect(Object.keys(words).sort()).toEqual(Object.keys(TAP_LISTS.en).sort());
  });

  it('puts a short answer and up to three taps in one buttons message', async () => {
    const replies = withTaps('All paid.', ['menu', 'track', 'talk']);
    expect(replies).toEqual([
      {
        kind: 'buttons',
        body: 'All paid.',
        buttons: [
          { id: 'menu', title: 'Menu' },
          { id: 'progress', title: 'Track my project' },
          { id: 'human', title: 'Talk to us' },
        ],
      },
    ]);
    const mr = await inLanguage('mr', async () => withTaps('ठीक', ['menu', 'pay', 'receipt']));
    expect(mr[0]).toMatchObject({
      buttons: [
        { id: 'menu', title: 'मेनू' },
        { id: 'payments', title: TAP_LISTS.mr.pay },
        { id: 'documents', title: TAP_LISTS.mr.receipt },
      ],
    });
  });

  it('sends a long answer as text, then the taps under a short question', () => {
    const long = 'x'.repeat(1100);
    const [text, taps] = withTaps(long, ['menu']);
    expect(text).toEqual({ kind: 'text', body: long });
    expect(taps).toEqual({
      kind: 'buttons',
      body: TAP_WORDS.whatNext,
      buttons: [{ id: 'menu', title: 'Menu' }],
    });
  });

  it('lets a tap answer one thing, such as View receipt sending that receipt', () => {
    const [reply] = withTaps('Paid.', [{ tap: 'receipt', id: 'paper:receipt:p1' }, 'menu']);
    expect(reply).toMatchObject({
      buttons: [
        { id: 'paper:receipt:p1', title: 'View receipt' },
        { id: 'menu', title: 'Menu' },
      ],
    });
  });

  it('offers Start again after STOP, answered like typing START', () => {
    const [reply] = withTaps('Stopped.', ['start']);
    expect(reply).toMatchObject({ buttons: [{ id: 'start', title: 'Start again' }] });
  });

  it('never offers more than three taps', () => {
    expect(() => withTaps('x', ['menu', 'pay', 'track', 'talk'])).toThrow();
  });
});

describe('menu words a customer may type (live review C5)', () => {
  it('knows Marathi, Hindi and English words for the menu and its main answers', () => {
    for (const word of ['menu', 'मेनू', 'मेन्यू', 'मेनु']) expect(menuWordChoice(word)).toBe('menu');
    for (const word of ['कागद', 'कागदपत्र', 'दस्तावेज़', 'documents', 'papers'])
      expect(menuWordChoice(word), word).toBe('documents');
    for (const word of ['पेमेंट', 'भुगतान', 'payment', 'pay'])
      expect(menuWordChoice(word), word).toBe('payments');
    for (const word of ['प्रगती', 'प्रगति', 'progress', 'प्रकल्प', 'project'])
      expect(menuWordChoice(word), word).toBe('progress');
    for (const word of ['वॉरंटी', 'warranty']) expect(menuWordChoice(word), word).toBe('warranty');
    expect(menuWordChoice('पावती')).toBe('documents');
    expect(menuWordChoice('inverter बंद आहे')).toBeUndefined();
  });
});
