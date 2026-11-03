import { describe, expect, it } from 'vitest';
import { menuChoice, restartsChat } from './incoming-words';

const typed = (text: string) => ({ kind: 'text' as const, text, choiceId: null });
const tapped = (choiceId: string) => ({ kind: 'choice' as const, text: 'Tap', choiceId });
const free = { state: 'menu', customerId: 'c1' };
const held = { state: 'human', customerId: 'c1' };

describe('what restarts the chat with the menu', () => {
  it('a hello or Menu restarts a chat the bot has', () => {
    for (const text of ['hi', 'Hello', 'नमस्कार', 'नमस्ते', 'menu'])
      expect(restartsChat(free, typed(text)), text).toBe(true);
    expect(restartsChat(free, tapped('menu'))).toBe(true);
  });

  it('while a person holds the chat, a hello is for that person (M5)', () => {
    for (const text of ['hi', 'Hello', 'नमस्कार', 'नमस्ते'])
      expect(restartsChat(held, typed(text)), text).toBe(false);
    // Only the Menu tap, or the word "menu", takes the chat back.
    expect(restartsChat(held, tapped('menu'))).toBe(true);
    expect(restartsChat(held, typed('menu'))).toBe(true);
    expect(restartsChat(held, typed('मेनू'))).toBe(true);
  });

  it('reads menu rows by number, id, title or a plain word', () => {
    expect(menuChoice('1')).toBe('progress');
    expect(menuChoice('payments')).toBe('payments');
    expect(menuChoice('तक्रार')).toBe('service');
    expect(menuChoice('menu')).toBeUndefined();
    expect(menuChoice('when will you come')).toBeUndefined();
  });
});
