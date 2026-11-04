import { describe, expect, it } from 'vitest';
import { describeHome, homeLabel, homeName } from './customer-homes';

describe('Customer homes', () => {
  it('names a home by its label and ends the consumer number', () => {
    expect(describeHome({ label: 'Farm', city: 'Sangli', consumerNumber: '170012345678' })).toEqual(
      {
        title: 'Farm',
        description: 'Sangli · consumer no. ending 5678',
      },
    );
  });

  it('falls back to the city and omits a missing consumer number', () => {
    expect(describeHome({ label: '  ', city: 'Pune', consumerNumber: null })).toEqual({
      title: 'Pune',
      description: 'Pune',
    });
  });

  it('keeps the title within 24 and the description within 72 characters', () => {
    const home = describeHome({
      label: 'A very long name for a farmhouse roof',
      city: 'Kolhapur'.repeat(12),
      consumerNumber: '12-34 5678',
    });
    expect(home.title.length).toBeLessThanOrEqual(24);
    expect(home.description.length).toBeLessThanOrEqual(72);
  });

  it('words a home for a reply', () => {
    expect(homeLabel({ title: 'Pune' })).toBe('your home at Pune');
  });

  it('tells two homes with the same name apart by the consumer number', () => {
    const pune = { propertyId: 'a', label: null, city: 'Pune', consumerNumber: '1700-1234' };
    const other = { propertyId: 'b', label: null, city: 'Pune', consumerNumber: '9999' };
    const farm = { propertyId: 'c', label: 'Farm', city: 'Pune', consumerNumber: '5678' };
    expect(homeName(pune, [pune, other, farm])).toBe('Pune (consumer no. ending 1234)');
    expect(homeName(farm, [pune, other, farm])).toBe('Farm');
    expect(homeName({ ...pune, consumerNumber: null }, [pune, other])).toBe('Pune');
    expect(homeName(pune, [pune])).toBe('Pune');
  });
});
