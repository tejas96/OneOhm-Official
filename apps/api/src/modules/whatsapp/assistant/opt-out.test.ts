import { describe, expect, it } from 'vitest';
import { inLanguage } from './language';
import { OPT_OUT_WORDS, optOutWord } from './opt-out';

describe('STOP and START words', () => {
  it('knows STOP words as the whole message, any case, trimmed', () => {
    for (const text of ['stop', ' STOP ', 'Unsubscribe', 'मेसेज बंद', 'संदेश बंद', 'मेसेज नको', 'मैसेज बंद'])
      expect(optOutWord(text), text).toBe('stop');
  });

  // "बंद" or "रद्द" alone is often about the system ("inverter बंद", "booking रद्द").
  it('does not stop messages on a bare बंद or रद्द', () => {
    for (const text of ['बंद', 'रद्द', 'inverter बंद', 'booking रद्द'])
      expect(optOutWord(text), text).toBeNull();
  });

  it('knows START words', () => {
    for (const text of ['start', 'START', 'सुरू', 'शुरू']) expect(optOutWord(text), text).toBe('start');
  });

  it('ignores a longer message that only contains the word', () => {
    for (const text of ['please stop the work', 'stop it', 'start my project', '', 'menu'])
      expect(optOutWord(text), text).toBeNull();
  });

  it('answers in all three languages', async () => {
    for (const language of ['en', 'mr', 'hi'] as const)
      await inLanguage(language, async () => {
        expect(OPT_OUT_WORDS.stopped.length).toBeGreaterThan(10);
        expect(OPT_OUT_WORDS.welcomeBack.length).toBeGreaterThan(10);
      });
    expect(OPT_OUT_WORDS.stopped).toBe(
      'You will not get WhatsApp messages from us now. Send START anytime to begin again.',
    );
    expect(await inLanguage('mr', async () => OPT_OUT_WORDS.stopped)).not.toBe(
      OPT_OUT_WORDS.stopped,
    );
    expect(await inLanguage('hi', async () => OPT_OUT_WORDS.welcomeBack)).not.toBe(
      OPT_OUT_WORDS.welcomeBack,
    );
  });
});
