import { describe, expect, it } from 'vitest';
import { CHAT_WORDS } from './chat-words';
import { withTaps } from './closing-taps';
import { inLanguage } from './language';

describe('the taps that end every bot message (live review C5)', () => {
  it('puts a short answer and up to three taps in one buttons message', async () => {
    const replies = withTaps('All paid.', ['receipts', 'update', 'menu']);
    expect(replies).toEqual([
      {
        kind: 'buttons',
        body: 'All paid.',
        buttons: [
          { id: 'go:receipts', title: 'Receipts' },
          { id: 'go:update', title: 'Project update' },
          { id: 'menu', title: 'Menu' },
        ],
      },
    ]);
    const mr = await inLanguage('mr', async () => withTaps('ठीक', ['menu', 'more']));
    expect(mr[0]).toMatchObject({
      buttons: [
        { id: 'menu', title: 'मेनू' },
        { id: 'go:more', title: 'आणखी' },
      ],
    });
  });

  it('takes our own buttons too, such as Pay ₹45,000', () => {
    const [reply] = withTaps('Due.', [{ id: 'pay:m1', title: 'Pay ₹45,000' }, 'menu']);
    expect(reply).toMatchObject({
      buttons: [{ id: 'pay:m1', title: 'Pay ₹45,000' }, { id: 'menu' }],
    });
  });

  it('sends a long answer as text, then the taps under a short question', () => {
    const long = 'x'.repeat(1100);
    const [text, taps] = withTaps(long, ['menu']);
    expect(text).toEqual({ kind: 'text', body: long });
    expect(taps).toEqual({
      kind: 'buttons',
      body: CHAT_WORDS.whatNext,
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
    expect(() => withTaps('x', ['menu', 'more', 'update', 'talk'])).toThrow();
  });
});
