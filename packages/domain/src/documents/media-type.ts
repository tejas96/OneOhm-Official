/**
 * Voice notes and short site videos (PRD 4.2). Like every other file, the type comes
 * from the bytes, never the name; each kind has its own size cap because uploads are
 * held in memory on the server.
 */
export const AUDIO_FILE_TYPES = [
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
] as const;
export type AudioFileType = (typeof AUDIO_FILE_TYPES)[number];

export const VIDEO_FILE_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export type VideoFileType = (typeof VIDEO_FILE_TYPES)[number];

export type MediaFileType = AudioFileType | VideoFileType;

const MB = 1024 * 1024;
/** A two-minute voice note is about 1 MB at the app's settings; 10 MB leaves room. */
export const MAX_AUDIO_BYTES = 10 * MB;
/** A one-minute video at the camera's medium quality is roughly 10–40 MB. */
export const MAX_VIDEO_BYTES = 60 * MB;
/** The longest voice note the app records. */
export const VOICE_NOTE_MAX_SECONDS = 120;
/** The longest video the app records or accepts from the gallery. */
export const VIDEO_MAX_SECONDS = 60;

export const isAudioType = (contentType: string): boolean => contentType.startsWith('audio/');
export const isVideoType = (contentType: string): boolean => contentType.startsWith('video/');
export const isMediaType = (contentType: string): boolean =>
  isAudioType(contentType) || isVideoType(contentType);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** Finds an ASCII marker in the first `limit` bytes. */
function contains(bytes: Uint8Array, marker: string, limit = bytes.length): boolean {
  const end = Math.min(bytes.length, limit) - marker.length;
  const first = marker.charCodeAt(0);
  for (let index = 0; index <= end; index += 1) {
    if (bytes[index] !== first) continue;
    let match = true;
    for (let offset = 1; offset < marker.length; offset += 1) {
      if (bytes[index + offset] !== marker.charCodeAt(offset)) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/** ISO base media brands browsers play; 3GP and protected iTunes files are left out. */
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'mp71',
  'avc1',
  'dash',
  'MSNV',
  'M4V ',
  'M4A ',
  'M4B ',
  'qt  ',
]);
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ']);

/**
 * Which track handlers an MP4 or QuickTime file has: each track's `hdlr` box names it
 * `vide` or `soun`. The movie box can sit at the end of the file, so the whole buffer
 * is searched (uploads are held in memory anyway).
 */
function trackKinds(bytes: Uint8Array): { video: boolean; audio: boolean } {
  let audio = false;
  for (let index = 0; index + 16 <= bytes.length; index += 1) {
    if (bytes[index] !== 0x68 || bytes[index + 1] !== 0x64) continue;
    if (bytes[index + 2] !== 0x6c || bytes[index + 3] !== 0x72) continue;
    const kind = ascii(bytes, index + 12, 4);
    if (kind === 'vide') return { video: true, audio };
    if (kind === 'soun') audio = true;
  }
  return { video: false, audio };
}

function isoMedia(bytes: Uint8Array): MediaFileType | null {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp') return null;
  const brand = ascii(bytes, 8, 4);
  if (!MP4_BRANDS.has(brand)) return null;
  const tracks = trackKinds(bytes);
  const video = tracks.video || (!tracks.audio && !AUDIO_BRANDS.has(brand));
  if (!video) return 'audio/mp4';
  return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
}

/** WebM from a browser's recorder: video when a video codec is named in its tracks. */
function webm(bytes: Uint8Array): MediaFileType | null {
  if (bytes.length < 4 || bytes[0] !== 0x1a || bytes[1] !== 0x45) return null;
  if (bytes[2] !== 0xdf || bytes[3] !== 0xa3) return null;
  if (!contains(bytes, 'webm', 64)) return null;
  const head = 1024 * 1024;
  if (['V_VP8', 'V_VP9', 'V_AV1', 'V_MPEG4'].some((codec) => contains(bytes, codec, head))) {
    return 'video/webm';
  }
  return ['A_OPUS', 'A_VORBIS'].some((codec) => contains(bytes, codec, head)) ? 'audio/webm' : null;
}

function ogg(bytes: Uint8Array): AudioFileType | null {
  if (bytes.length < 4 || ascii(bytes, 0, 4) !== 'OggS') return null;
  return contains(bytes, 'OpusHead', 512) || contains(bytes, 'vorbis', 512) ? 'audio/ogg' : null;
}

/** An MP3 frame (MPEG audio layer III) or an AAC ADTS frame, read from the frame header. */
function audioFrame(bytes: Uint8Array): AudioFileType | null {
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return 'audio/mpeg';
  if (bytes.length < 4 || bytes[0] !== 0xff) return null;
  const second = bytes[1] ?? 0;
  const third = bytes[2] ?? 0;
  if ((second & 0xe0) !== 0xe0) return null;
  const layer = (second >> 1) & 0x03;
  if (layer === 0x00 && (second & 0xf6) === 0xf0 && ((third >> 2) & 0x0f) < 13) {
    return 'audio/aac';
  }
  const version = (second >> 3) & 0x03;
  const bitrate = third >> 4;
  const sampling = (third >> 2) & 0x03;
  const valid = version !== 0x01 && bitrate !== 0x0f && bitrate !== 0 && sampling !== 0x03;
  return layer === 0x01 && valid ? 'audio/mpeg' : null;
}

/** Detects the accepted audio and video formats from their bytes; anything else is null. */
export function detectMediaType(bytes: Uint8Array): MediaFileType | null {
  return isoMedia(bytes) ?? webm(bytes) ?? ogg(bytes) ?? audioFrame(bytes);
}

/** The cap for one file of this type: 10 MB audio, 60 MB video, 25 MB anything else. */
export function maxBytesFor(contentType: string, otherwise: number): number {
  if (isAudioType(contentType)) return MAX_AUDIO_BYTES;
  if (isVideoType(contentType)) return MAX_VIDEO_BYTES;
  return otherwise;
}

/** "10 MB", "60 MB": a cap as people read it. */
export const megabytes = (bytes: number): string => `${Math.round(bytes / MB)} MB`;
