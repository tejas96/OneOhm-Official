import { describe, expect, it } from 'vitest';
import { readTrackToken, signTrackToken, type TrackToken, trackSharing } from './track-token';

const SECRET = 'a-test-secret-of-some-length';
const NOW = Date.parse('2026-11-16T06:00:00Z');
const token: TrackToken = {
  jobId: '7d3c2a10-1111-4abc-8def-0123456789ab',
  service: false,
  workerId: '1b2c3d4e-2222-4abc-8def-0123456789ab',
  day: '2026-11-16',
  issuedAt: NOW / 1000,
};

describe('the track link', () => {
  it('reads back what it signs', () => {
    const value = signTrackToken(SECRET, token);
    expect(readTrackToken(SECRET, value, NOW)).toEqual(token);
    const service = signTrackToken(SECRET, { ...token, service: true });
    expect(readTrackToken(SECRET, service, NOW)?.service).toBe(true);
  });

  it('refuses an altered link, another secret or rubbish', () => {
    const value = signTrackToken(SECRET, token);
    const [data, mac] = value.split('.');
    const other = Buffer.from(JSON.stringify(['x', 0, 'y', '2026-11-16', NOW / 1000])).toString(
      'base64url',
    );
    expect(readTrackToken(SECRET, `${other}.${mac}`, NOW)).toBeNull();
    expect(readTrackToken('another-secret-entirely', value, NOW)).toBeNull();
    expect(readTrackToken(SECRET, `${data}`, NOW)).toBeNull();
    expect(readTrackToken(SECRET, 'not.a-token', NOW)).toBeNull();
  });

  it('shares the position for 3 hours, and opens nothing after 7 days', () => {
    const value = signTrackToken(SECRET, token);
    expect(trackSharing(token, NOW + 2.9 * 3_600_000)).toBe(true);
    expect(trackSharing(token, NOW + 3 * 3_600_000)).toBe(false);
    expect(readTrackToken(SECRET, value, NOW + 6 * 86_400_000)).not.toBeNull();
    expect(readTrackToken(SECRET, value, NOW + 7.1 * 86_400_000)).toBeNull();
  });
});
