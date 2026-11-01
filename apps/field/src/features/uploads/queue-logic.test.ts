import { describe, expect, it } from 'vitest';
import { geotagFromExif } from './geotag';
import {
  afterFailure,
  isPassing,
  MAX_PARALLEL,
  mine,
  nextWake,
  onItsWay,
  parseQueue,
  type QueuedUpload,
  RETRY_DELAYS_MS,
  readyToSend,
  retriedNow,
  retryDelay,
  wakeAll,
} from './queue-logic';

const NOW = 1_800_000_000_000;

function item(overrides: Partial<QueuedUpload> = {}): QueuedUpload {
  return {
    id: 'up-1',
    userId: 'asha',
    taskId: 'task-1',
    kind: 'photo',
    category: 'site_photo',
    name: 'Roof east.jpg',
    type: 'image/jpeg',
    uri: 'file:///documents/pending-evidence/up-1.jpg',
    geotag: null,
    attempts: 0,
    error: null,
    autoRetry: false,
    retryAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('retrying', () => {
  it('backs off and then repeats the longest wait', () => {
    expect(retryDelay(1)).toBe(RETRY_DELAYS_MS[0]);
    expect(retryDelay(3)).toBe(RETRY_DELAYS_MS[2]);
    expect(retryDelay(40)).toBe(60_000);
  });

  it('retries by itself only when the failure can pass', () => {
    expect([0, 401, 408, 429, 500, 503].every(isPassing)).toBe(true);
    expect([400, 403, 404, 409, 413, 422].some(isPassing)).toBe(false);
    const offline = afterFailure(item(), { status: 0, message: 'No signal' }, NOW);
    expect(offline).toMatchObject({ attempts: 1, autoRetry: true, retryAt: NOW + 2_000 });
    const refused = afterFailure(item(), { status: 413, message: 'Too large' }, NOW);
    expect(refused).toMatchObject({ autoRetry: false, retryAt: null, error: 'Too large' });
    expect(onItsWay(offline)).toBe(true);
    expect(onItsWay(refused)).toBe(false);
  });

  it('sends a refused file again only when asked', () => {
    const refused = afterFailure(item(), { status: 422, message: 'Wrong type' }, NOW);
    expect(
      readyToSend([refused], { userId: 'asha', now: NOW + 999_999, sending: new Set() }),
    ).toEqual([]);
    expect(
      readyToSend([retriedNow(refused)], { userId: 'asha', now: NOW, sending: new Set() }),
    ).toHaveLength(1);
  });

  it('tries waiting uploads at once when the phone is back online', () => {
    const waiting = afterFailure(item(), { status: 0, message: 'No signal' }, NOW);
    expect(readyToSend([waiting], { userId: 'asha', now: NOW + 1, sending: new Set() })).toEqual(
      [],
    );
    const woken = wakeAll([waiting], NOW + 1);
    expect(readyToSend(woken, { userId: 'asha', now: NOW + 1, sending: new Set() })).toHaveLength(
      1,
    );
  });
});

describe('readyToSend', () => {
  it('sends the oldest first, within the parallel limit, never twice', () => {
    const queue = [3, 1, 2, 4].map((n) => item({ id: `up-${n}`, createdAt: NOW + n }));
    const first = readyToSend(queue, { userId: 'asha', now: NOW, sending: new Set() });
    expect(first.map((entry) => entry.id)).toEqual(['up-1', 'up-2']);
    expect(first).toHaveLength(MAX_PARALLEL);
    const busy = new Set(['up-1']);
    expect(
      readyToSend(queue, { userId: 'asha', now: NOW, sending: busy }).map((e) => e.id),
    ).toEqual(['up-2']);
  });

  it('leaves another person’s uploads alone', () => {
    const queue = [item({ userId: 'priya' })];
    expect(readyToSend(queue, { userId: 'asha', now: NOW, sending: new Set() })).toEqual([]);
    expect(mine(queue, 'asha')).toEqual([]);
  });
});

describe('nextWake', () => {
  it('wakes for the soonest automatic retry', () => {
    const queue = [
      item({ id: 'a', autoRetry: true, retryAt: NOW + 30_000, error: 'x' }),
      item({ id: 'b', autoRetry: true, retryAt: NOW + 5_000, error: 'x' }),
      item({ id: 'c', error: 'refused' }),
    ];
    expect(nextWake(queue, 'asha', NOW)).toBe(NOW + 5_000);
    expect(nextWake([item({ error: 'refused' })], 'asha', NOW)).toBeNull();
  });
});

describe('parseQueue', () => {
  it('reads back saved uploads and drops anything unreadable', () => {
    const saved = JSON.parse(JSON.stringify([item(), { id: 'broken' }, 'junk']));
    expect(parseQueue(saved)).toEqual([item()]);
    expect(parseQueue(null)).toEqual([]);
  });
});

describe('geotagFromExif', () => {
  it('reads Android’s flat decimal tags', () => {
    expect(
      geotagFromExif({
        GPSLatitude: 16.8531,
        GPSLatitudeRef: 'N',
        GPSLongitude: 74.5817,
        GPSLongitudeRef: 'E',
        DateTimeOriginal: '2026:11:01 10:22:33',
      }),
    ).toEqual({ latitude: 16.8531, longitude: 74.5817, takenAt: '2026-11-01T10:22:33' });
  });

  it('reads iOS’s GPS block and rational degrees, south and west negative', () => {
    const tag = geotagFromExif({
      '{GPS}': {
        Latitude: '16/1,51/1,1116/100',
        LatitudeRef: 'S',
        Longitude: 74.58,
        LongitudeRef: 'W',
      },
      '{Exif}': { DateTimeOriginal: '2026:11:01 09:00:00' },
    });
    expect(tag?.latitude).toBeCloseTo(-16.8531, 3);
    expect(tag?.longitude).toBe(-74.58);
    expect(tag?.takenAt).toBe('2026-11-01T09:00:00');
  });

  it('is null without a position', () => {
    expect(geotagFromExif(null)).toBeNull();
    expect(geotagFromExif({ DateTimeOriginal: '2026:11:01 09:00:00' })).toBeNull();
    expect(geotagFromExif({ GPSLatitude: 0, GPSLongitude: 0 })).toBeNull();
  });
});
