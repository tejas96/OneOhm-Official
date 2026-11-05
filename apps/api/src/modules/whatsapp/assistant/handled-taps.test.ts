import { describe, expect, it } from 'vitest';
import { assistantAnswers, assistantAnswersTap } from './handled-taps';

const tap = (choiceId: string) => ({ kind: 'choice' as const, choiceId });
const typed = { kind: 'text' as const, choiceId: null };
const HOME = 'home:0b6f2f9e-6c1a-4f43-9d55-3f3c2a1b7e10';

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

  it('answers its own rating and which-home taps (menu audit H3, M10)', () => {
    for (const rating of ['rate:1', 'rate:5'])
      expect(assistantAnswersTap({ customerId: 'c1' }, tap(rating)), rating).toBe(true);
    expect(assistantAnswersTap({ customerId: 'c1' }, tap('rate:9'))).toBe(false);
    expect(assistantAnswersTap({ customerId: 'c1' }, tap(HOME))).toBe(true);
    expect(assistantAnswersTap({ customerId: null }, tap('rate:5'))).toBe(false);
  });

  it('answers its own What is this? taps and home taps, and only well-formed ones', () => {
    const uuid = '0b6f2f9e-6c1a-4f43-9d55-3f3c2a1b7e10';
    for (const id of [
      'what:yes',
      'what:diff',
      'what:ask',
      `what:a:${uuid}`,
      `what:i:${uuid}:bill`,
      `what:change:${uuid}`,
      `where:${uuid}`,
    ])
      expect(assistantAnswersTap({ customerId: 'c1' }, tap(id)), id).toBe(true);
    expect(assistantAnswersTap({ customerId: 'c1' }, tap('what:nonsense'))).toBe(false);
    expect(assistantAnswersTap({ customerId: 'c1' }, tap('fpaper:none'))).toBe(false);
    expect(assistantAnswersTap({ customerId: null }, tap('what:yes'))).toBe(false);
  });

  it('answers a stranger’s own Call me back and Talk to a person buttons (review F5)', () => {
    expect(assistantAnswersTap({ customerId: null }, tap('callback'))).toBe(true);
    expect(assistantAnswersTap({ customerId: null }, tap('human'))).toBe(true);
    expect(assistantAnswersTap({ customerId: null }, tap('payments'))).toBe(false);
  });

  it('leaves typed words to the person', () => {
    expect(assistantAnswersTap({ customerId: 'c1' }, typed)).toBe(false);
  });

  it('takes typed words in a held chat only when its own step waits for them (M6)', () => {
    const held = { customerId: 'c1', state: 'human', context: {} };
    expect(assistantAnswers(held, typed)).toBe(false);
    const waiting = { ...held, context: { step: 'await_problem', stepAt: Date.now() } };
    expect(assistantAnswers(waiting, typed)).toBe(true);
    expect(assistantAnswers(waiting, tap('menu'))).toBe(true);
    // A stale step is over: the words are for the person (review F1).
    const stale = { ...held, context: { step: 'await_problem', stepAt: Date.now() - 31 * 60_000 } };
    expect(assistantAnswers(stale, typed)).toBe(false);
  });

  it('takes a file in a held chat only for a complaint (review F3)', () => {
    const file = { kind: 'media' as const, choiceId: null };
    const at = (step: string) => ({
      customerId: 'c1',
      state: 'human',
      context: { step, stepAt: Date.now() },
    });
    expect(assistantAnswers(at('await_problem'), file)).toBe(true);
    for (const step of ['await_referral', 'await_comment', 'await_home'])
      expect(assistantAnswers(at(step), file), step).toBe(false);
  });

  it('answers a message WhatsApp could not pass on, even in a held chat', () => {
    const held = { customerId: 'c1', state: 'human', context: {} };
    const unsupported = { kind: 'other' as const, choiceId: null, unsupported: true };
    expect(assistantAnswers(held, unsupported)).toBe(true);
    expect(assistantAnswers(held, { kind: 'other' as const, choiceId: null })).toBe(false);
  });
});
