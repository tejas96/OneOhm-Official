import { describe, expect, it } from 'vitest';
import { cityFromPin } from './onboarding-answer';

const CITIES = ['Pune', 'Satara', 'Sangli'];
const bare = { name: null, address: null };

describe('cityFromPin', () => {
  it('reads the place name or address', () => {
    expect(cityFromPin({ name: 'Shop', address: 'MG Road, SATARA 415001' }, CITIES)).toBe('Satara');
  });
  it('reads the geocoded locality, district or area', () => {
    const none = { locality: null, district: null, sublocality: null };
    expect(cityFromPin(bare, CITIES, { ...none, locality: 'Sangli' })).toBe('Sangli');
    expect(cityFromPin(bare, CITIES, { ...none, district: 'Pune District' })).toBe('Pune');
    expect(cityFromPin(bare, CITIES, { ...none, sublocality: ' pune. ' })).toBe('Pune');
  });
  it('knows Devanagari names that are configured', () => {
    const place = { locality: 'सांगली', district: null, sublocality: null };
    expect(cityFromPin(bare, ['सांगली'], place)).toBe('सांगली');
  });
  it('is null when no served city is named', () => {
    const place = { locality: 'Kolhapur', district: 'Kolhapur', sublocality: null };
    expect(cityFromPin(bare, CITIES, place)).toBeNull();
    expect(cityFromPin(bare, CITIES, null)).toBeNull();
    expect(cityFromPin(bare, [], place)).toBeNull();
  });
});
