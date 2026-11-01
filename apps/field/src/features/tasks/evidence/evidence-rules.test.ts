import type { ProjectTask } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  checklistDone,
  completionFacts,
  documentCategoryFor,
  measurementsDone,
} from './evidence-rules';

const base = { checklist: [], measurements: [] } as unknown as ProjectTask;

describe('documentCategoryFor', () => {
  it('files documents where the office looks for them', () => {
    expect(documentCategoryFor({ templateKey: 'electricity_details', stage: 'survey' })).toBe(
      'electricity_bill',
    );
    expect(documentCategoryFor({ templateKey: 'loan_submission', stage: 'design' })).toBe(
      'bank_loan',
    );
    expect(documentCategoryFor({ templateKey: 'discom_inspection', stage: 'net_metering' })).toBe(
      'discom',
    );
    expect(documentCategoryFor({ templateKey: 'custom_step', stage: 'installation' })).toBe(
      'other',
    );
  });
});

describe('checklist and measurements on the phone', () => {
  const task = {
    ...base,
    checklist: [
      { key: 'checklist_a_one', label: 'One', done: false },
      { key: 'checklist_a_two', label: 'Two', done: false },
    ],
    measurements: ['roof_length_m'],
  } as ProjectTask;

  it('is done once every item is ticked and every measurement typed', () => {
    expect(checklistDone(task, new Set(['checklist_a_one']))).toBe(false);
    expect(checklistDone(task, new Set(['checklist_a_one', 'checklist_a_two']))).toBe(true);
    expect(measurementsDone(task, { roof_length_m: ' ' })).toBe(false);
    expect(measurementsDone(task, { roof_length_m: '12.5' })).toBe(true);
  });

  it('sends ticks as facts beside the typed ones', () => {
    expect(completionFacts({ roof_length_m: '12' }, new Set(['checklist_a_one']), 'yes')).toEqual({
      roof_length_m: '12',
      checklist_a_one: 'yes',
    });
  });
});
