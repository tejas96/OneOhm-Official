import { describe, expect, it } from 'vitest';
import { assistantAnswersTap } from './handled-taps';

const tap = (choiceId: string) => ({ kind: 'choice' as const, choiceId });

describe('taps the assistant answers while a person has the chat', () => {
  it('treats the Menu tap as the bot’s own, for customers and strangers alike', () => {
    expect(assistantAnswersTap({ customerId: 'c1' }, tap('menu'))).toBe(true);
    expect(assistantAnswersTap({ customerId: null }, tap('menu'))).toBe(true);
  });

  it('leaves typed words to the person', () => {
    expect(assistantAnswersTap({ customerId: 'c1' }, { kind: 'text', choiceId: null })).toBe(false);
  });
});
