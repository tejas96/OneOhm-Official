// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
import { describe, expect, it } from 'vitest';
import { FORM_LIMITS } from './form-words';
import { PAID_ANOTHER_WAY_FLOW } from './paid-another-way.flow';
import { PAID_LISTS } from './paid-words';

describe('the I paid another way form', () => {
  for (const [language, words] of Object.entries(PAID_LISTS)) {
    it(`${language}: every word fits Meta's limits`, () => {
      expect(words.button.length).toBeLessThanOrEqual(FORM_LIMITS.button);
      expect(words.heading('₹45,000', 'Sangli').length).toBeLessThanOrEqual(FORM_LIMITS.heading);
      expect(words.amountLabel.length).toBeLessThanOrEqual(FORM_LIMITS.label);
      expect(words.dateLabel.length).toBeLessThanOrEqual(FORM_LIMITS.label);
      expect(words.photosLabel.length).toBeLessThanOrEqual(FORM_LIMITS.label);
      expect(words.amountHint('₹45,000').length).toBeLessThanOrEqual(FORM_LIMITS.hint);
      expect(words.photosHint.length).toBeLessThanOrEqual(FORM_LIMITS.hint);
      expect(words.send.length).toBeLessThanOrEqual(FORM_LIMITS.send);
      expect(words.body('₹45,000', 'Sangli').length).toBeLessThanOrEqual(FORM_LIMITS.body);
    });
  }

  it('has one screen with an amount, a date and a camera photo picker, completing with all three', () => {
    const [screen] = PAID_ANOTHER_WAY_FLOW.screens;
    const form = screen?.layout.children.find((child) => child.type === 'Form');
    const kinds = (form as { children: { type: string }[] }).children.map((child) => child.type);
    expect(kinds).toEqual(['TextInput', 'DatePicker', 'PhotoPicker', 'Footer']);
    const json = JSON.stringify(PAID_ANOTHER_WAY_FLOW);
    expect(json).toContain('camera_gallery');
    expect(json).toContain('${form.amount}');
    expect(json).toContain('${form.date}');
    expect(json).toContain('${form.photos}');
  });
});
