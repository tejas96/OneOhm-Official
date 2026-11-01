import { describe, expect, it } from 'vitest';
import { changeRequestField, keyFromTitle } from './change-request-catalog';
import { checkChangeRequestType } from './change-request-config-check';
import { DEFAULT_CHANGE_REQUEST_TYPES, defaultChangeRequestType } from './change-request-defaults';
import { changeRequestUpdate } from './change-request-effects';
import { CHANGE_REQUEST_TYPES, missingChangeRequestDocuments } from './change-request-types';

const known = { roles: new Set(['liaisoning']), taskKeys: new Set(['discom_application']) };
const nameChange = defaultChangeRequestType('consumer_name_change');
if (!nameChange) throw new Error('The name change type is missing.');

describe('starting change-request types', () => {
  it('covers every type OneOhm suggests, and each passes its own check', () => {
    expect(DEFAULT_CHANGE_REQUEST_TYPES.map((type) => type.key)).toEqual([...CHANGE_REQUEST_TYPES]);
    for (const type of DEFAULT_CHANGE_REQUEST_TYPES) {
      expect(checkChangeRequestType(type, known)).toEqual({});
    }
  });

  it('keeps the steps MSEDCL works through today', () => {
    expect(defaultChangeRequestType('load_change')?.steps.map((step) => step.durationDays)).toEqual(
      [3, 2, 7, 7],
    );
    expect(defaultChangeRequestType('new_connection')?.steps.at(-1)?.captures).toEqual([
      'consumer_number',
    ]);
  });
});

describe('checkChangeRequestType', () => {
  it('refuses a site update nothing fills in', () => {
    const errors = checkChangeRequestType({ ...nameChange, updates: ['sanctionedLoadW'] }, known);
    expect(errors.updates).toMatch(/never filled in/);
  });

  it('accepts an update a step records, and refuses unknown roles, tasks and days', () => {
    const meter = {
      ...nameChange,
      updates: ['evMeterNumber' as const],
      steps: [{ ...nameChange.steps[0], captures: ['ev_meter_number' as const] }],
    };
    expect(checkChangeRequestType(meter as typeof nameChange, known)).toEqual({});
    const bad = checkChangeRequestType(
      {
        ...nameChange,
        steps: [{ ...nameChange.steps[0], roleKey: 'pilot', durationDays: 400 }],
        blocks: { stages: [], taskKeys: ['nope'] },
      } as typeof nameChange,
      known,
    );
    expect(Object.keys(bad).sort()).toEqual([
      'blocks.taskKeys',
      'steps.0.durationDays',
      'steps.0.roleKey',
    ]);
  });

  it('asks for a name and at least one step', () => {
    const errors = checkChangeRequestType({ ...nameChange, title: 'x', steps: [] }, known);
    expect(errors.title).toBeDefined();
    expect(errors.steps).toBe('Add at least one step.');
  });
});

describe('building blocks', () => {
  it('gives each field its kind and options from the named list', () => {
    expect(changeRequestField({ key: 'phase', required: true })).toEqual({
      key: 'phase',
      kind: 'select',
      options: ['single', 'three'],
      required: true,
    });
    expect(changeRequestField({ key: 'newLoadKw', required: false }).kind).toBe('kw');
  });

  it('makes a key from a title', () => {
    expect(keyFromTitle('Meter shifting (3-phase)')).toBe('meter_shifting_3_phase');
    expect(keyFromTitle('3 phase')).toBe('type_3_phase');
  });

  it('lists the papers still missing', () => {
    expect(
      missingChangeRequestDocuments(['electricity_bill', 'property'], ['property', 'other']),
    ).toEqual(['electricity_bill']);
  });

  it('writes the corrected spelling to the consumer name', () => {
    const { patch } = changeRequestUpdate(
      ['meterHolderName'],
      { correctedName: 'Ramesh Patil' },
      {},
      {
        meterHolderName: 'Ramehs Patil',
        subsidyCategory: 'individual',
        phase: null,
        sanctionedLoadW: null,
        consumerNumber: null,
        evMeterNumber: null,
      },
    );
    expect(patch).toEqual({ meterHolderName: 'Ramesh Patil' });
  });
});
