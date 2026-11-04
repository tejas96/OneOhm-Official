import { describe, expect, it } from 'vitest';
import { heldStep, STEP_MINUTES, stepOf } from './chat-step';

const NOW = 1_800_000_000_000;
const ago = (minutes: number) => NOW - minutes * 60_000;

describe('the step a chat waits on', () => {
  it('keeps a held step inside the hold while it is fresh', () => {
    const chat = { state: 'human', context: { step: 'await_problem', stepAt: ago(5) } };
    expect(heldStep(chat, NOW)).toBe('await_problem');
    expect(stepOf(chat, NOW)).toBe('await_problem');
  });

  it(`ignores a step older than ${STEP_MINUTES} minutes (review F1)`, () => {
    const held = { state: 'human', context: { step: 'await_problem', stepAt: ago(31) } };
    expect(heldStep(held, NOW)).toBeNull();
    expect(stepOf(held, NOW)).toBe('human');
    const free = { state: 'await_referral', context: { stepAt: ago(31) } };
    expect(stepOf(free, NOW)).toBe('menu');
    expect(stepOf({ state: 'await_referral', context: { stepAt: ago(2) } }, NOW)).toBe(
      'await_referral',
    );
  });
});
