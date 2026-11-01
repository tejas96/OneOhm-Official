import { describe, expect, it } from 'vitest';
import { defaultChangeRequestType } from './change-request-defaults';
import {
  changeRequestUpdate,
  type PropertyUtilityDetails,
  suggestChangeRequests,
} from './change-request-effects';
import { validateChangeRequestValues } from './change-request-types';

/** The site details each starting type updates, as a DISCOM's copy has them. */
const updatesOf = (key: string) => defaultChangeRequestType(key)?.updates ?? [];

const property: PropertyUtilityDetails = {
  meterHolderName: 'Ramesh Patil',
  subsidyCategory: 'individual',
  phase: 'single',
  sanctionedLoadW: 3000,
  consumerNumber: '279990012345',
  evMeterNumber: null,
};

describe('changeRequestUpdate', () => {
  it('writes the new consumer name and keeps the old one for history', () => {
    const { patch, previous } = changeRequestUpdate(
      updatesOf('consumer_name_change'),
      { newName: 'Sunita Patil' },
      {},
      property,
    );
    expect(patch).toEqual({ meterHolderName: 'Sunita Patil' });
    expect(previous).toEqual({ meterHolderName: 'Ramesh Patil' });
  });

  it('sets phase and sanctioned load in watts for a load change', () => {
    const { patch, previous } = changeRequestUpdate(
      updatesOf('load_change'),
      { phase: 'three', newLoadKw: '7.5' },
      {},
      property,
    );
    expect(patch).toEqual({ phase: 'three', sanctionedLoadW: 7500 });
    expect(previous).toEqual({ phase: 'single', sanctionedLoadW: 3000 });
  });

  it('takes the new consumer number recorded by the last step of a new connection', () => {
    const { patch } = changeRequestUpdate(
      updatesOf('new_connection'),
      { phase: 'three' },
      { consumer_number: '279990099999' },
      { ...property, consumerNumber: null },
    );
    expect(patch).toEqual({ phase: 'three', consumerNumber: '279990099999' });
  });

  it('keeps the EV meter number recorded by the last step on the site', () => {
    const { patch, previous } = changeRequestUpdate(
      updatesOf('new_ev_meter'),
      { note: 'Garage' },
      { ev_meter_number: 'EV-7781' },
      property,
    );
    expect(patch).toEqual({ evMeterNumber: 'EV-7781' });
    expect(previous).toEqual({ evMeterNumber: null });
  });

  it('changes nothing on the property for an EV meter with no number yet', () => {
    expect(changeRequestUpdate(updatesOf('new_ev_meter'), {}, {}, property).patch).toEqual({});
  });
});

describe('validateChangeRequestValues', () => {
  it('requires the typed fields and checks the load', () => {
    const result = validateChangeRequestValues(
      defaultChangeRequestType('load_change')?.fields ?? [],
      {
        phase: 'three',
        newLoadKw: 'x',
      },
    );
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
