import {
  ACCEPTED_FILE_TYPES,
  type DetectedFileType,
  detectFileType,
  isMediaType,
  megabytes,
  safeFileName,
  uploadLimitFor,
  uploadLimitOf,
} from '@oneohm/domain';
import { invalid } from '../../common/http/errors';

/** What multer hands over for the `file` part (memory storage). */
export interface IncomingFile {
  readonly originalname: string;
  readonly size: number;
  readonly buffer: Buffer;
}

export interface CheckedFile {
  readonly buffer: Buffer;
  readonly contentType: DetectedFileType;
  /** What people see, e.g. "Roof photo east.jpg". */
  readonly name: string;
  /** The same name made safe for storage keys and headers. */
  readonly keyName: string;
}

const EXTENSION: Readonly<Record<DetectedFileType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function kindsOf(allowed: readonly DetectedFileType[]): string {
  if (allowed.some(isMediaType)) {
    const parts = [
      'a photo',
      ...(allowed.includes('application/pdf') ? ['a PDF'] : []),
      'a voice note (M4A, MP3, AAC, WebM, Ogg)',
    ];
    return `${parts.join(', ')} or a video (MP4, MOV, WebM)`;
  }
  return allowed.includes('application/pdf')
    ? 'a photo (JPEG, PNG, WebP, HEIC) or a PDF'
    : 'a PNG, JPEG or WebP image';
}

function tooLarge(contentType: DetectedFileType): string {
  const cap = megabytes(uploadLimitOf(contentType));
  if (contentType.startsWith('audio/')) return `This voice note is larger than ${cap}.`;
  if (contentType.startsWith('video/')) return `This video is larger than ${cap}. Keep it short.`;
  return `This file is larger than ${cap}.`;
}

/**
 * The file's real type comes from its bytes; the name only labels it. Anything outside
 * the allowed list, or larger than its type's cap (voice notes 10 MB, videos 60 MB,
 * everything else 25 MB), is refused before it reaches storage.
 */
export function checkFile(
  file: IncomingFile | undefined,
  allowed: readonly DetectedFileType[] = ACCEPTED_FILE_TYPES,
  label?: string,
): CheckedFile {
  if (!file || file.size === 0) throw invalid('Choose a file to upload.', { file: 'Required.' });
  if (file.size > uploadLimitFor(allowed)) {
    throw invalid(`This file is larger than ${megabytes(uploadLimitFor(allowed))}.`, {
      file: 'Too large.',
    });
  }
  const contentType = detectFileType(file.buffer);
  if (!contentType || !allowed.includes(contentType)) {
    throw invalid(`Upload ${kindsOf(allowed)}.`, { file: 'This file type is not accepted.' });
  }
  if (file.size > uploadLimitOf(contentType)) {
    throw invalid(tooLarge(contentType), { file: 'Too large.' });
  }
  const original = (file.originalname || 'file').split(/[\\/]/).pop() ?? 'file';
  const base = (label?.trim() || original).replace(/\.[a-z0-9]{1,5}$/i, '').slice(0, 150);
  const extension = EXTENSION[contentType];
  return {
    buffer: file.buffer,
    contentType,
    name: `${base.trim() || 'file'}.${extension}`,
    keyName: `${safeFileName(base)}.${extension}`,
  };
}
