import { describe, expect, it } from 'vitest';
import { describeHome, homeLabel } from './customer-homes';

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
});
