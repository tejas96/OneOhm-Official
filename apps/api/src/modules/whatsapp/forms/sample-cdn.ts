import { encryptFormMedia } from './media-encrypt';

/** The prefix of the stand-in CDN addresses the log-mode gateway answers to. */
export const SAMPLE_CDN_PREFIX = 'sample-cdn://';

/** This address serves a file whose bytes were changed on the way. */
export const SAMPLE_CDN_TAMPERED = `${SAMPLE_CDN_PREFIX}tampered`;

const KEYS = {
  key: Buffer.alloc(32, 7),
  hmacKey: Buffer.alloc(32, 9),
  iv: Buffer.alloc(16, 3),
};

/** What an encrypted form upload of `plain` looks like: the file WhatsApp keeps, and its keys. */
export function sampleCdnFile(plain: Buffer) {
  return encryptFormMedia(plain, KEYS);
}

/** The file served at a stand-in address (the same encrypted sample every time). */
export function serveSampleCdn(url: string, plain: Buffer): Buffer {
  const { cdnFile } = sampleCdnFile(plain);
  if (url !== SAMPLE_CDN_TAMPERED) return cdnFile;
  const changed = Buffer.from(cdnFile);
  changed[0] = (changed[0] ?? 0) ^ 0xff;
  return changed;
}
