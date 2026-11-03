import { describe, expect, it } from 'vitest';
import { assistantAnswersTap } from './handled-taps';

const tap = (choiceId: string) => ({ kind: 'choice' as const, choiceId });

describe('taps the assistant answers while a person has the chat', () => {
  it('treats the Menu tap as the bot’s own, for customers and strangers alike', () => {
    expect(assistantAnswersTap({ customerId: 'c1' }, tap('menu'))).toBe(true);
    expect(assistantAnswersTap({ customerId: null }, tap('menu'))).toBe(true);
  });

  it('answers Start again in any chat, and a customer’s paper taps', () => {
    expect(assistantAnswersTap({ customerId: null }, tap('start'))).toBe(true);
    const receipt = tap('paper:receipt:0b6f2f9e-6c1a-4f43-9d55-3f3c2a1b7e10');
    expect(assistantAnswersTap({ customerId: 'c1' }, receipt)).toBe(true);
    expect(assistantAnswersTap({ customerId: null }, receipt)).toBe(false);
    expect(assistantAnswersTap({ customerId: 'c1' }, tap('paper:nonsense'))).toBe(false);
  });

  it('leaves typed words to the person', () => {
    expect(assistantAnswersTap({ customerId: 'c1' }, { kind: 'text', choiceId: null })).toBe(false);
  });
});
