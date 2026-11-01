import { describe, expect, it } from 'vitest';
import {
  changeRequestUpdate,
  type PropertyUtilityDetails,
  suggestChangeRequests,
} from './change-request-effects';
import { validateChangeRequestValues } from './change-request-types';

const property: PropertyUtilityDetails = {
  meterHolderName: 'Ramesh Patil',
  subsidyCategory: 'individual',
  phase: 'single',
  sanctionedLoadW: 3000,
  consumerNumber: '279990012345',
};

describe('changeRequestUpdate', () => {
  it('writes the new consumer name and keeps the old one for history', () => {
    const { patch, previous } = changeRequestUpdate(
      'consumer_name_change',
      { newName: 'Sunita Patil' },
      {},
      property,
    );
    expect(patch).toEqual({ meterHolderName: 'Sunita Patil' });
    expect(previous).toEqual({ meterHolderName: 'Ramesh Patil' });
  });

  it('sets phase and sanctioned load in watts for a load change', () => {
    const { patch, previous } = changeRequestUpdate(
      'load_change',
      { phase: 'three', newLoadKw: '7.5' },
      {},
      property,
    );
    expect(patch).toEqual({ phase: 'three', sanctionedLoadW: 7500 });
    expect(previous).toEqual({ phase: 'single', sanctionedLoadW: 3000 });
  });

  it('takes the new consumer number recorded by the last step of a new connection', () => {
    const { patch } = changeRequestUpdate(
      'new_connection',
      { phase: 'three' },
      { consumer_number: '279990099999' },
      { ...property, consumerNumber: null },
    );
    expect(patch).toEqual({ phase: 'three', consumerNumber: '279990099999' });
  });

  it('changes nothing on the property for a new EV meter', () => {
    expect(changeRequestUpdate('new_ev_meter', {}, {}, property).patch).toEqual({});
  });
});

describe('validateChangeRequestValues', () => {
  it('requires the typed fields and checks the load', () => {
    const result = validateChangeRequestValues('load_change', { phase: 'three', newLoadKw: 'x' });
    expect(result.errors).toEqual({ newLoadKw: 'Enter the load in kW, for example 5 or 7.5.' });
  });
});

describe('suggestChangeRequests', () => {
  it('spots a misspelt meter holder and a system bigger than the sanctioned load', () => {
    const suggestions = suggestChangeRequests({
      customerName: 'Ramesh Patil',
      meterHolderName: 'Ramehs Patil',
      sanctionedLoadW: 3000,
      consumerNumber: '279990012345',
      proposedCapacityWp: 5450,
    });
    expect(suggestions.map((suggestion) => suggestion.type)).toEqual([
      'name_spelling_correction',
      'load_change',
    ]);
  });
});
