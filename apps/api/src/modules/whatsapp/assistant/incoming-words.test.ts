import { describe, expect, it } from 'vitest';
import { choiceOf, restartsChat } from './incoming-words';

const typed = (text: string) => ({ kind: 'text' as const, text, choiceId: null });
const tapped = (choiceId: string) => ({ kind: 'choice' as const, text: 'Tap', choiceId });
const free = { state: 'menu', customerId: 'c1' };
const held = { state: 'human', customerId: 'c1' };

describe('what shows Home again', () => {
  it('a hello (with punctuation) or Menu restarts a chat the bot has', () => {
    for (const text of ['hi', 'Hello!', 'Hey', 'Namaste!', 'नमस्कार', 'नमस्ते', 'menu', 'Menu.'])
      expect(restartsChat(free, typed(text)), text).toBe(true);
    expect(restartsChat(free, tapped('menu'))).toBe(true);
    expect(restartsChat(free, typed('hi, when will you come?'))).toBe(false);
  });

  it('while a person holds the chat, a hello is for that person (M5)', () => {
    for (const text of ['hi', 'Hello', 'नमस्कार', 'नमस्ते'])
      expect(restartsChat(held, typed(text)), text).toBe(false);
    // Only the Menu tap, or the word "menu", takes the chat back.
    expect(restartsChat(held, tapped('menu'))).toBe(true);
    expect(restartsChat(held, typed('menu'))).toBe(true);
    expect(restartsChat(held, typed('मेनू'))).toBe(true);
  });
});

describe('what a message picks', () => {
  it('reads our taps, old menu ids and known words; never a bare number (decision 8)', () => {
    expect(choiceOf(tapped('go:payments'))).toBe('payments');
    expect(choiceOf(tapped('progress'))).toBe('update');
    expect(choiceOf(tapped('go:nonsense'))).toBeUndefined();
    expect(choiceOf(typed('payments'))).toBe('payments');
    expect(choiceOf(typed('When will you come?'))).toBe('update');
    expect(choiceOf(typed('तक्रार'))).toBe('problem');
    for (const number of ['1', '2', '10']) expect(choiceOf(typed(number)), number).toBeUndefined();
    expect(choiceOf(typed('menu'))).toBeUndefined();
  });
});
