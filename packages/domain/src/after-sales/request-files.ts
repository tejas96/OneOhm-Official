import { type DetectedFileType, PHOTO_FILE_TYPES } from '../documents/file-type';
import {
  AUDIO_FILE_TYPES,
  isAudioType,
  isVideoType,
  VIDEO_FILE_TYPES,
} from '../documents/media-type';

/**
 * What a customer can add to their own help request (PRD 5.5): photos of the problem,
 * one short video and one voice note. Papers stay out.
 */
export const REQUEST_FILE_TYPES: readonly DetectedFileType[] = [
  ...PHOTO_FILE_TYPES,
  ...AUDIO_FILE_TYPES,
  ...VIDEO_FILE_TYPES,
];

export type RequestFileKind = 'photo' | 'video' | 'voice_note';

/** Enough to show the problem: six photos, one video, one voice note. */
export const REQUEST_FILE_LIMITS: Readonly<Record<RequestFileKind, number>> = {
  photo: 6,
  video: 1,
  voice_note: 1,
};

export function requestFileKind(contentType: string): RequestFileKind {
  if (isAudioType(contentType)) return 'voice_note';
  if (isVideoType(contentType)) return 'video';
  return 'photo';
}

/** Whether one more file of this kind fits beside the files already on the request. */
export function requestFileFits(contentType: string, existingTypes: readonly string[]): boolean {
  const kind = requestFileKind(contentType);
  const used = existingTypes.filter((type) => requestFileKind(type) === kind).length;
  return used < REQUEST_FILE_LIMITS[kind];
}

/** Why a visit day cannot be saved: the request is resolved, or the day has passed. */
export type VisitDayProblem = 'resolved' | 'past' | null;

/** Today is fine; clearing the day is always fine while the request is open. */
export function visitDayProblem(
  status: string,
  visitOn: string | null,
  today: string,
): VisitDayProblem {
  if (status === 'resolved') return 'resolved';
  if (visitOn !== null && visitOn < today) return 'past';
  return null;
}

/** A booked or moved day tells the customer; clearing it or saving the same day does not. */
export const visitDayIsNews = (before: string | null, after: string | null): boolean =>
  after !== null && after !== before;
