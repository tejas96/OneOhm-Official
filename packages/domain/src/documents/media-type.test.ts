import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_FILE_TYPES,
  detectFileType,
  EVIDENCE_FILE_TYPES,
  MAX_UPLOAD_BYTES,
  uploadLimitFor,
  uploadLimitOf,
} from './file-type';
import {
  AUDIO_FILE_TYPES,
  isAudioType,
  isMediaType,
  isVideoType,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  megabytes,
} from './media-type';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part,
    ),
  );
const zero = (count: number) => Array.from({ length: count }, () => 0);
/** A track's handler box: size, `hdlr`, version and flags, pre-defined, handler type. */
const handler = (kind: 'vide' | 'soun') => bytes([0, 0, 0, 33], 'hdlr', zero(8), kind, zero(12));
const iso = (brand: string, ...tracks: Uint8Array[]) =>
  Uint8Array.from([
    ...bytes([0, 0, 0, 24], 'ftyp', brand, [0, 0, 2, 0], 'isommp42'),
    ...bytes([0, 0, 0, 8], 'mdat'),
    ...tracks.flatMap((track) => [...track]),
  ]);
const ebml = (docType: string, codecs: string) =>
  bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], docType, zero(16), codecs);

describe('detectFileType for voice notes and videos', () => {
  it('tells an M4A voice note from an MP4 or QuickTime video by its tracks', () => {
    expect(detectFileType(iso('M4A '))).toBe('audio/mp4');
    expect(detectFileType(iso('isom', handler('soun')))).toBe('audio/mp4');
    expect(detectFileType(iso('mp42', handler('soun'), handler('vide')))).toBe('video/mp4');
    expect(detectFileType(iso('qt  ', handler('vide'), handler('soun')))).toBe('video/quicktime');
    // Without a readable movie box, an ISO brand is taken as video.
    expect(detectFileType(iso('mp42'))).toBe('video/mp4');
  });

  it('reads WebM and Ogg from a browser recorder', () => {
    expect(detectFileType(ebml('webm', 'A_OPUS'))).toBe('audio/webm');
    expect(detectFileType(ebml('webm', 'V_VP8A_OPUS'))).toBe('video/webm');
    expect(detectFileType(ebml('matroska', 'V_VP8'))).toBeNull();
    expect(detectFileType(bytes('OggS', zero(24), 'OpusHead'))).toBe('audio/ogg');
    expect(detectFileType(bytes('OggS', zero(24), [0x80], 'theora'))).toBeNull();
  });

  it('reads MP3 and AAC frames', () => {
    expect(detectFileType(bytes('ID3', [4, 0, 0, 0]))).toBe('audio/mpeg');
    expect(detectFileType(bytes([0xff, 0xfb, 0x90, 0x64]))).toBe('audio/mpeg');
    expect(detectFileType(bytes([0xff, 0xf1, 0x50, 0x80]))).toBe('audio/aac');
    expect(detectFileType(bytes([0xff, 0xff, 0xff, 0xff]))).toBeNull();
  });

  it('keeps photos and papers as they were, and refuses 3GP', () => {
    expect(detectFileType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectFileType(bytes([0, 0, 0, 24], 'ftypheic', zero(4)))).toBe('image/heic');
    expect(detectFileType(iso('3gp4', handler('vide')))).toBeNull();
  });
});

describe('upload size rules', () => {
  it('caps voice notes at 10 MB and videos at 60 MB; papers and photos stay at 25 MB', () => {
    expect(uploadLimitOf('audio/mp4')).toBe(MAX_AUDIO_BYTES);
    expect(uploadLimitOf('video/quicktime')).toBe(MAX_VIDEO_BYTES);
    expect(uploadLimitOf('image/jpeg')).toBe(MAX_UPLOAD_BYTES);
    expect(megabytes(MAX_AUDIO_BYTES)).toBe('10 MB');
    expect(megabytes(MAX_VIDEO_BYTES)).toBe('60 MB');
  });

  it('reads up to the largest allowed type, never less than the paper cap', () => {
    expect(uploadLimitFor(EVIDENCE_FILE_TYPES)).toBe(MAX_VIDEO_BYTES);
    expect(uploadLimitFor(ACCEPTED_FILE_TYPES)).toBe(MAX_UPLOAD_BYTES);
    expect(uploadLimitFor(AUDIO_FILE_TYPES)).toBe(MAX_UPLOAD_BYTES);
  });

  it('accepts media only as evidence, never as a library paper', () => {
    expect((ACCEPTED_FILE_TYPES as readonly string[]).some(isMediaType)).toBe(false);
    expect(EVIDENCE_FILE_TYPES.filter(isAudioType)).toHaveLength(5);
    expect(EVIDENCE_FILE_TYPES.filter(isVideoType)).toHaveLength(3);
  });
});
