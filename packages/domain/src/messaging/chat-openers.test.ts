import { describe, expect, it } from 'vitest';
import { asksForPerson, CHAT_OPENERS, saysHello } from './chat-openers';

describe('chat openers', () => {
  it('knows "talk to a person" in every language, with or without a full stop', () => {
    for (const text of Object.values(CHAT_OPENERS.talkToPerson)) {
      expect(asksForPerson(text)).toBe(true);
      expect(asksForPerson(` ${text}. `)).toBe(true);
    }
    expect(asksForPerson('TALK TO A PERSON')).toBe(true);
    expect(asksForPerson('I want to talk to a person about my bill')).toBe(false);
  });

  it('knows a hello in every language', () => {
    expect(saysHello('नमस्कार')).toBe(true);
    expect(saysHello('नमस्ते।')).toBe(true);
    expect(saysHello('hi')).toBe(true);
    expect(saysHello('hi, my inverter is off')).toBe(false);
  });
});
