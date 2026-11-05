import { describe, expect, it } from 'vitest';
import { inLanguage } from '../whatsapp/assistant/language';
import { SURVEY_FORM_LISTS } from './survey-form-words';
import { answerTap, readSurveyTap } from './survey-taps';
import { SURVEY_LISTS } from './survey-words';

const ID = '11111111-1111-4111-8111-111111111111';

describe('the self survey words', () => {
  for (const code of ['en', 'mr', 'hi'] as const) {
    const words = SURVEY_LISTS[code];
    it(`fit WhatsApp's limits in ${code}`, () => {
      for (const title of Object.values(words.buttons))
        expect(title.length).toBeLessThanOrEqual(20);
      for (const group of Object.values(words.options))
        for (const title of Object.values(group)) expect(title.length).toBeLessThanOrEqual(24);
      expect(words.offer('₹1,000').length).toBeLessThanOrEqual(1024);
      const form = SURVEY_FORM_LISTS[code];
      expect(form.consumerLabel.length).toBeLessThanOrEqual(20);
      expect(form.consumerHint.length).toBeLessThanOrEqual(80);
      for (const heading of [form.roofHeading, form.cornerAHeading, form.detailsHeading])
        expect(heading.length).toBeLessThanOrEqual(80);
      for (const label of [form.roofLabel, form.floorsLabel, form.shadeLabel, form.sizeLabel])
        expect(label.length).toBeLessThanOrEqual(30);
      for (const title of [form.next, form.send]) expect(title.length).toBeLessThanOrEqual(35);
      for (const group of Object.values(words.options))
        for (const title of Object.values(group)) expect(title.length).toBeLessThanOrEqual(30);
    });
  }

  it('says the discount and keeps the buttons English by default', async () => {
    expect(SURVEY_LISTS.en.offer('₹1,000')).toContain('₹1,000 off');
    expect(await inLanguage('mr', async () => SURVEY_LISTS.mr.buttons.start)).toBe('सर्वे सुरू करा');
  });

  it('reads its taps', () => {
    expect(readSurveyTap(`ss:go:${ID}`)).toEqual({ t: 'go', id: ID });
    expect(readSurveyTap(`ss:vnew:${ID}`)).toEqual({ t: 'vnew', id: ID });
    expect(readSurveyTap(answerTap(ID, 'size', 'unknown'))).toEqual({
      t: 'answer',
      id: ID,
      question: 'size',
      value: 'unknown',
    });
    expect(readSurveyTap('ss:ans:bad')).toBeNull();
    expect(readSurveyTap(null)).toBeNull();
  });
});
