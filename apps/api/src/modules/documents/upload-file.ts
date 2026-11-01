import {
  ACCEPTED_FILE_TYPES,
  type AcceptedFileType,
  detectFileType,
  MAX_UPLOAD_BYTES,
  safeFileName,
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
  readonly contentType: AcceptedFileType;
  /** What people see, e.g. "Roof photo east.jpg". */
  readonly name: string;
  /** The same name made safe for storage keys and headers. */
  readonly keyName: string;
}

const EXTENSION: Readonly<Record<AcceptedFileType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/**
 * The file's real type comes from its bytes; the name only labels it. Anything outside
 * the allowed list is refused before it reaches storage.
 */
export function checkFile(
  file: IncomingFile | undefined,
  allowed: readonly AcceptedFileType[] = ACCEPTED_FILE_TYPES,
  label?: string,
): CheckedFile {
  if (!file || file.size === 0) throw invalid('Choose a file to upload.', { file: 'Required.' });
  if (file.size > MAX_UPLOAD_BYTES) {
    throw invalid('This file is larger than 25 MB.', { file: 'Too large.' });
  }
  const contentType = detectFileType(file.buffer);
  if (!contentType || !allowed.includes(contentType)) {
    const kinds = allowed.includes('application/pdf')
      ? 'a photo (JPEG, PNG, WebP, HEIC) or a PDF'
      : 'a PNG, JPEG or WebP image';
    throw invalid(`Upload ${kinds}.`, { file: 'This file type is not accepted.' });
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
