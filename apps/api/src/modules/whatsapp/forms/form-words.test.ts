import { describe, expect, it } from 'vitest';
import { inLanguage } from '../assistant/language';
import { FORM_LIMITS, FORM_LISTS, sendPaperData, sendPaperStart } from './form-words';
import { SEND_PAPER_FLOW, SEND_PAPER_MIME_TYPES } from './send-paper.flow';

const LANGUAGES = ['en', 'mr', 'hi'] as const;
const LONG_PAPER = 'Electricity bill of the last three months for the main house and the farm shed';

const shape = (value: unknown, path = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, inner]) => shape(inner, `${path}.${key}`))
    : [path];

describe('the Send a paper form words', () => {
  it('say the same things in English, Marathi and Hindi', () => {
    for (const language of ['mr', 'hi'] as const)
      expect(shape(FORM_LISTS[language]).sort()).toEqual(shape(FORM_LISTS.en).sort());
  });

  it('keep to Meta limits in every language, even with a long paper name', () => {
    for (const language of LANGUAGES) {
      const words = FORM_LISTS[language];
      expect(words.button.length, language).toBeLessThanOrEqual(FORM_LIMITS.button);
      expect(words.label.length, language).toBeLessThanOrEqual(FORM_LIMITS.label);
      expect(words.hint.length, language).toBeLessThanOrEqual(FORM_LIMITS.hint);
      expect(words.send.length, language).toBeLessThanOrEqual(FORM_LIMITS.send);
      expect(words.body(LONG_PAPER, 'Sangli — consumer no. ending 1234').length).toBeLessThan(
        FORM_LIMITS.body,
      );
    }
  });

  it('fill the screen from the start data, in the chat language, heading cut to 80', async () => {
    for (const language of LANGUAGES) {
      const start = await inLanguage(language, async () =>
        sendPaperStart(LONG_PAPER, 'Sangli', 'action-1'),
      );
      expect(start.data.heading.length).toBeLessThanOrEqual(FORM_LIMITS.heading);
      expect(start.data.label).toBe(FORM_LISTS[language].label);
      expect(start.button).toBe(FORM_LISTS[language].button);
      expect(start.payload).toEqual({ actionId: 'action-1' });
    }
    expect(sendPaperData('Aadhaar / PAN', null).heading).toBe('Aadhaar / PAN');
    expect(sendPaperData('Electricity bill', 'Sangli').heading).toBe('Electricity bill — Sangli');
  });

  it('end the message with the chat fallback line (redesign §1)', async () => {
    for (const language of LANGUAGES) {
      const start = await inLanguage(language, async () => sendPaperStart('Bill', null, 'a'));
      expect(
        start.body.endsWith(FORM_LISTS[language].body('x', null).split('\n\n')[1] ?? '?'),
      ).toBe(true);
    }
    expect(FORM_LISTS.en.body('Bill', null)).toContain('Or just send the photo here.');
  });
});

describe('the Send a paper Flow JSON', () => {
  const screen = SEND_PAPER_FLOW.screens[0];
  const pickers = JSON.stringify(screen).match(/"(DocumentPicker|PhotoPicker)"/g) ?? [];

  it('has one screen with one picker for 1 to 4 photos or PDFs, version 4.0 or later', () => {
    expect(SEND_PAPER_FLOW.screens).toHaveLength(1);
    expect(Number.parseFloat(SEND_PAPER_FLOW.version)).toBeGreaterThanOrEqual(4);
    expect(pickers).toEqual(['"DocumentPicker"']);
    const form = screen?.layout.children[1] as { children: Record<string, unknown>[] };
    const picker = form.children[0] as Record<string, unknown>;
    expect(picker['max-uploaded-documents']).toBe(4);
    expect(picker['min-uploaded-documents']).toBe(1);
    expect(picker['allowed-mime-types']).toEqual([...SEND_PAPER_MIME_TYPES]);
  });

  it('takes every word from the start data, and completes with the files', () => {
    const text = JSON.stringify(screen);
    for (const key of ['heading', 'hint', 'label', 'send'])
      expect(text).toContain(`\${data.${key}}`);
    expect(text).toContain('"name":"complete"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a Flow JSON data binding
    expect(text).toContain('"files":"${form.files}"');
  });
});
