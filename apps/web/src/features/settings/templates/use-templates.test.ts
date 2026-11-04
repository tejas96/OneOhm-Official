import { DEFAULT_MESSAGE_TEMPLATES } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { SAMPLE, sampleFor } from './use-templates';

describe('SAMPLE', () => {
  it('has a sample for every detail a shipped message uses, so previews never show {{n}}', () => {
    const missing = DEFAULT_MESSAGE_TEMPLATES.flatMap((template) => template.fields).filter(
      (field) => !(field in SAMPLE),
    );
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('sampleFor', () => {
  it('previews the staff invite with an app link, not a pay link', () => {
    expect(sampleFor('staff_welcome').link).toBe('https://app.oneohm.in');
    expect(sampleFor('payment_link').link).toBe(SAMPLE.link);
  });
});
