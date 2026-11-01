import { describe, expect, it } from 'vitest';
import { captureInstant, geotagFields } from './geotag-fields';

describe('geotag upload fields', () => {
  it('sends the camera position, accuracy and India time of a photo', () => {
    expect(
      geotagFields({
        latitude: 16.8531,
        longitude: 74.5817,
        takenAt: '2026-11-01T10:42:00',
        accuracyM: 8.4,
        source: 'device',
      }),
    ).toEqual({
      capturedAt: '2026-11-01T10:42:00+05:30',
      latitude: '16.8531',
      longitude: '74.5817',
      accuracyM: '8',
      geoSource: 'device',
    });
  });

  it('sends only the time when location is not shared', () => {
    expect(
      geotagFields({ latitude: null, longitude: null, takenAt: '2026-11-01T10:42:00Z' }),
    ).toEqual({ capturedAt: '2026-11-01T10:42:00Z', geoSource: 'exif' });
  });

  it('sends nothing without a geotag, and drops a time it cannot read', () => {
    expect(geotagFields(null)).toEqual({});
    expect(geotagFields({ latitude: null, longitude: null, takenAt: 'yesterday' })).toEqual({});
    expect(captureInstant('2026-11-01T10:42:00+05:30')).toBe('2026-11-01T10:42:00+05:30');
  });
});
