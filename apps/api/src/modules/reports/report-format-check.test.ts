import { describe, expect, it } from 'vitest';
import { builtInDefinitions } from './report-definitions';
import { checkReportBody, sampleFacts } from './report-format-check';

const fieldError = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return (error as { fieldErrors?: Record<string, string> }).fieldErrors?.body;
  }
  return undefined;
};

describe('checkReportBody', () => {
  it("accepts every one of OneOhm's own formats and lists what each needs", () => {
    for (const definition of builtInDefinitions()) {
      const requires = checkReportBody(definition.body);
      expect(
        requires.map((item) => item.field),
        definition.key,
      ).toEqual([...definition.required, ...(definition.company ?? [])]);
    }
  });

  it('refuses a detail nobody records', () => {
    expect(fieldError(() => checkReportBody('<p>{{consumer_name}} {{roof_colour}}</p>'))).toBe(
      'Unknown: roof_colour.',
    );
  });

  it('refuses helpers and blocks OneOhm does not have', () => {
    expect(fieldError(() => checkReportBody('<p>{{shout consumer_name}}</p>'))).toBe(
      'Unknown: shout.',
    );
    expect(fieldError(() => checkReportBody('<p>{{> letterhead}}</p>'))).toBe(
      'Unknown: letterhead.',
    );
  });

  it('refuses a template that does not read', () => {
    expect(fieldError(() => checkReportBody('<p>{{#if consumer_name}}open</p>'))).toBeTruthy();
  });

  it('labels what a new format needs, including the company profile', () => {
    expect(checkReportBody('<p>{{consumer_name}} for {{vendor_name}}</p>')).toEqual([
      { field: 'consumer_name', label: 'Consumer name' },
      { field: 'legalName', label: 'Company legal name (Settings → Company)' },
    ]);
  });
});

describe('sampleFacts', () => {
  it('fills dates, numbers and text so every part of a sample shows', () => {
    const facts = sampleFacts(
      '{{formatDate sanction_date}} {{module_count}} {{consumer_name}} {{#if lightning_arrester_text}}x{{/if}}',
      '2026-11-01',
    );
    expect(facts).toEqual({
      sanction_date: '2026-11-01',
      module_count: '5',
      consumer_name: '[Consumer name]',
      lightning_arrester_text: '[Lightning arrester]',
    });
  });
});
