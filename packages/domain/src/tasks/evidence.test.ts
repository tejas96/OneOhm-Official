import { describe, expect, it } from 'vitest';
import { missingEvidence, missingMeasurements } from './evidence';
import { checklistFactKey, checklistFor, measurementsFor } from './task-checklists';

const task = (evidence: string[], templateKey = 'custom_task', captures: string[] = []) => ({
  templateKey,
  evidence,
  captures,
});
const photo = { contentType: 'image/jpeg', category: 'site_photo' };
const pdf = { contentType: 'application/pdf', category: 'site_photo' };
const bill = { contentType: 'image/jpeg', category: 'electricity_bill' };
const signature = { contentType: 'image/png', category: 'customer_signature' };
const none = new Set<string>();

describe('missingEvidence', () => {
  it('asks for a photo until an image other than the signature is attached', () => {
    expect(missingEvidence(task(['photo']), [], none)).toEqual(['photo']);
    expect(missingEvidence(task(['photo']), [pdf], none)).toEqual(['photo']);
    expect(missingEvidence(task(['photo']), [signature], none)).toEqual(['photo']);
    expect(
      missingEvidence(task(['photo']), [{ ...photo, contentType: 'image/heic' }], none),
    ).toEqual([]);
  });

  it('takes a PDF or any file filed as a paper as the document', () => {
    expect(missingEvidence(task(['document']), [photo], none)).toEqual(['document']);
    expect(missingEvidence(task(['document']), [signature], none)).toEqual(['document']);
    expect(missingEvidence(task(['document']), [pdf], none)).toEqual([]);
    expect(missingEvidence(task(['document']), [bill], none)).toEqual([]);
  });

  it('needs the signature file for a sign-off', () => {
    expect(missingEvidence(task(['signature', 'document']), [pdf], none)).toEqual(['signature']);
    expect(missingEvidence(task(['signature', 'document']), [pdf, signature], none)).toEqual([]);
  });

  it('needs every checklist item ticked', () => {
    const survey = task(['checklist'], 'site_survey');
    const keys = checklistFor(survey).map((item) => item.key);
    expect(keys).toContain(checklistFactKey('site_survey', 'roof_access'));
    expect(missingEvidence(survey, [], new Set(keys.slice(1)))).toEqual(['checklist']);
    expect(missingEvidence(survey, [], new Set(keys))).toEqual([]);
  });

  it('needs every measurement recorded', () => {
    const survey = task(['measurement'], 'site_survey');
    const recorded = new Set(['roof_length_m', 'roof_width_m']);
    expect(missingEvidence(survey, [], recorded)).toEqual(['measurement']);
    expect(missingMeasurements(survey, recorded)).toEqual(['shadow_free_area_sqm']);
    expect(missingEvidence(survey, [], new Set([...recorded, 'shadow_free_area_sqm']))).toEqual([]);
  });

  it('does not block what the task does not ask for', () => {
    expect(missingEvidence(task([]), [], none)).toEqual([]);
  });
});

describe('measurementsFor', () => {
  it('uses the number facts of a Settings template, or one notes field', () => {
    expect(
      measurementsFor(task(['measurement'], 'custom', ['earthing_resistance', 'inverter_make'])),
    ).toEqual(['earthing_resistance']);
    expect(measurementsFor(task(['measurement'], 'custom', ['inverter_make']))).toEqual([
      'site_measurements',
    ]);
    expect(measurementsFor(task(['photo'], 'site_survey'))).toEqual([]);
  });
});

describe('checklistFor', () => {
  it('gives Settings templates a short generic checklist', () => {
    expect(checklistFor(task(['checklist'])).map((item) => item.label)).toHaveLength(2);
    expect(checklistFor(task(['photo'], 'site_survey'))).toEqual([]);
  });
});
