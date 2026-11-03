import { describe, expect, it } from 'vitest';
import { directionsUrl } from './directions';

describe('directionsUrl', () => {
  it('uses the point when there is one, even with an address', () => {
    expect(directionsUrl({ latitude: 18.5204, longitude: 73.8567 }, '12 MG Road, Pune')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=18.5204,73.8567',
    );
  });
  it('searches the address, encoded, when there is no point', () => {
    expect(directionsUrl(null, '12 MG Road, Pune & Co')).toBe(
      'https://www.google.com/maps/search/?api=1&query=12%20MG%20Road%2C%20Pune%20%26%20Co',
    );
  });
  it('is null with neither a point nor an address', () => {
    expect(directionsUrl(null, null)).toBeNull();
    expect(directionsUrl(null, '  ')).toBeNull();
  });
});
