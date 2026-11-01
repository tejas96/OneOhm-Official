import { describe, expect, it } from 'vitest';
import {
  REQUEST_FILE_TYPES,
  requestFileFits,
  requestFileKind,
  visitDayIsNews,
  visitDayProblem,
} from './request-files';

describe('requestFileKind', () => {
  it('names photos, videos and voice notes by their type', () => {
    expect(requestFileKind('image/jpeg')).toBe('photo');
    expect(requestFileKind('video/mp4')).toBe('video');
    expect(requestFileKind('audio/webm')).toBe('voice_note');
  });

  it('takes photos, videos and voice notes but no papers', () => {
    expect(REQUEST_FILE_TYPES).toContain('image/heic');
    expect(REQUEST_FILE_TYPES).toContain('video/quicktime');
    expect(REQUEST_FILE_TYPES).toContain('audio/mp4');
    expect(REQUEST_FILE_TYPES).not.toContain('application/pdf');
  });
});

describe('requestFileFits', () => {
  const sixPhotos = Array.from({ length: 6 }, () => 'image/jpeg');

  it('keeps six photos, one video and one voice note apart', () => {
    expect(requestFileFits('image/png', sixPhotos.slice(1))).toBe(true);
    expect(requestFileFits('image/png', sixPhotos)).toBe(false);
    expect(requestFileFits('video/mp4', sixPhotos)).toBe(true);
    expect(requestFileFits('audio/mp4', [...sixPhotos, 'video/mp4'])).toBe(true);
  });

  it('refuses a second video or a second voice note', () => {
    expect(requestFileFits('video/webm', ['video/mp4'])).toBe(false);
    expect(requestFileFits('audio/ogg', ['audio/mp4'])).toBe(false);
  });
});

describe('visitDayProblem', () => {
  const today = '2026-11-01';

  it('takes today or a later day, and clearing, while the request is open', () => {
    expect(visitDayProblem('open', today, today)).toBeNull();
    expect(visitDayProblem('in_progress', '2026-11-05', today)).toBeNull();
    expect(visitDayProblem('open', null, today)).toBeNull();
  });

  it('refuses a past day and any change once resolved', () => {
    expect(visitDayProblem('open', '2026-10-31', today)).toBe('past');
    expect(visitDayProblem('resolved', '2026-11-05', today)).toBe('resolved');
    expect(visitDayProblem('resolved', null, today)).toBe('resolved');
  });
});

describe('visitDayIsNews', () => {
  it('tells the customer of a new or moved day only', () => {
    expect(visitDayIsNews(null, '2026-11-04')).toBe(true);
    expect(visitDayIsNews('2026-11-04', '2026-11-06')).toBe(true);
    expect(visitDayIsNews('2026-11-04', '2026-11-04')).toBe(false);
    expect(visitDayIsNews('2026-11-04', null)).toBe(false);
  });
});
