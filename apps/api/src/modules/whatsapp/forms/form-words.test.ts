import { describe, expect, it } from 'vitest';
import { inLanguage } from '../assistant/language';
import { FORM_LIMITS, FORM_LISTS, sendPaperData, sendPaperStart } from './form-words';
import { SEND_PAPER_FLOW, SEND_PDF_MIME_TYPES, SEND_PDF_SCREEN } from './send-paper.flow';

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
      for (const label of [words.photosLabel, words.pdfLabel])
        expect(label.length, language).toBeLessThanOrEqual(FORM_LIMITS.label);
      for (const hint of [words.photosHint, words.pdfHint])
        expect(hint.length, language).toBeLessThanOrEqual(FORM_LIMITS.hint);
      expect(words.pdfLink.length, language).toBeLessThanOrEqual(FORM_LIMITS.link);
      expect(words.send.length, language).toBeLessThanOrEqual(FORM_LIMITS.send);
      expect(words.body(LONG_PAPER, 'Sangli — consumer no. ending 1234').length).toBeLessThan(
        FORM_LIMITS.body,
      );
    }
  });

  it('fill the screen from the start data, in the chat language, heading cut to 80', async () => {
    for (const language of LANGUAGES) {
      const start = await inLanguage(language, async () =>
        sendPaperStart(LONG_PAPER, 'Sangli', { actionId: 'action-1' }),
      );
      expect(start.data.heading.length).toBeLessThanOrEqual(FORM_LIMITS.heading);
      expect(start.data.pdf_link).toBe(FORM_LISTS[language].pdfLink);
      expect(start.button).toBe(FORM_LISTS[language].button);
      expect(start.payload).toEqual({ actionId: 'action-1' });
    }
    expect(sendPaperData('Aadhaar / PAN', null).heading).toBe('Aadhaar / PAN');
    expect(sendPaperData('Electricity bill', 'Sangli').heading).toBe('Electricity bill — Sangli');
  });

  it('end the message with the chat fallback line (redesign §1)', async () => {
    for (const language of LANGUAGES) {
      const start = await inLanguage(language, async () =>
        sendPaperStart('Bill', null, { actionId: 'a' }),
      );
      expect(
        start.body.endsWith(FORM_LISTS[language].body('x', null).split('\n\n')[1] ?? '?'),
      ).toBe(true);
    }
    expect(FORM_LISTS.en.body('Bill', null)).toContain('Or just send the photo here.');
  });
});

describe('the Send a paper Flow JSON', () => {
  const [entry, pdf] = SEND_PAPER_FLOW.screens;
  const children = (screen: typeof entry) =>
    (screen?.layout.children[1] as { children: Record<string, unknown>[] } | undefined)?.children ??
    [];

  it('has two screens: photos (camera or gallery, 1 to 4) and PDFs (1 to 2), version 4.0 or later', () => {
    expect(SEND_PAPER_FLOW.screens).toHaveLength(2);
    expect(Number.parseFloat(SEND_PAPER_FLOW.version)).toBeGreaterThanOrEqual(4);
    const photos = children(entry)[0] ?? {};
    expect(photos).toMatchObject({
      type: 'PhotoPicker',
      name: 'photos',
      'photo-source': 'camera_gallery',
      'min-uploaded-photos': 1,
      'max-uploaded-photos': 4,
      'max-file-size-kb': 25600,
    });
    const pdfs = children(pdf)[0] ?? {};
    expect(pdfs).toMatchObject({
      type: 'DocumentPicker',
      name: 'pdfs',
      'min-uploaded-documents': 1,
      'max-uploaded-documents': 2,
      'allowed-mime-types': [...SEND_PDF_MIME_TYPES],
    });
    expect(pdf?.terminal).toBe(true);
  });

  it('links to the PDF screen and completes each screen with its own files', () => {
    const link = children(entry)[1] as {
      type: string;
      'on-click-action': { next: { name: string } };
    };
    expect(link.type).toBe('EmbeddedLink');
    expect(link['on-click-action'].next.name).toBe(SEND_PDF_SCREEN);
    expect(JSON.stringify(entry)).toContain('"complete","payload":{"photos"');
    expect(JSON.stringify(pdf)).toContain('"complete","payload":{"pdfs"');
  });

  it('takes every word from the start data', () => {
    const text = JSON.stringify(SEND_PAPER_FLOW);
    for (const key of [
      'heading',
      'photos_label',
      'photos_hint',
      'pdf_link',
      'pdf_label',
      'pdf_hint',
      'send',
    ])
      expect(text).toContain(`\${data.${key}}`);
  });
});
