import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** What WhatsApp sends beside an encrypted form file: the keys and the two hashes (base64). */
export interface EncryptionMetadata {
  readonly encryption_key: string;
  readonly hmac_key: string;
  readonly iv: string;
  readonly plaintext_hash: string;
  readonly encrypted_hash: string;
}

/** A form file that did not pass: it was changed on the way, or is not what WhatsApp described. */
export class MediaTamperedError extends Error {}

/** WhatsApp keeps the first 10 bytes of the HMAC at the end of the file. */
const MAC_BYTES = 10;

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest();

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Opens a file WhatsApp kept encrypted on its CDN (AES-256-CBC, HMAC-SHA256): the SHA-256
 * of the download must be `encrypted_hash`; the first 10 bytes of HMAC(iv + ciphertext)
 * must be the 10 bytes at its end; after decrypting, the SHA-256 must be `plaintext_hash`.
 * Anything else throws `MediaTamperedError`, before or instead of returning bytes.
 */
export function decryptFormMedia(cdnFile: Buffer, meta: EncryptionMetadata): Buffer {
  const iv = Buffer.from(meta.iv, 'base64');
  const key = Buffer.from(meta.encryption_key, 'base64');
  const hmacKey = Buffer.from(meta.hmac_key, 'base64');
  if (key.length !== 32 || iv.length !== 16 || hmacKey.length === 0)
    throw new MediaTamperedError('The form file has bad keys.');
  if (cdnFile.length <= MAC_BYTES) throw new MediaTamperedError('The form file is too short.');
  if (!sameBytes(sha256(cdnFile), Buffer.from(meta.encrypted_hash, 'base64')))
    throw new MediaTamperedError('The form file does not match its hash.');
  const cipherText = cdnFile.subarray(0, cdnFile.length - MAC_BYTES);
  const mac = cdnFile.subarray(cdnFile.length - MAC_BYTES);
  const expected = createHmac('sha256', hmacKey).update(iv).update(cipherText).digest();
  if (!sameBytes(expected.subarray(0, MAC_BYTES), mac))
    throw new MediaTamperedError('The form file failed its signature check.');
  let plain: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  } catch {
    throw new MediaTamperedError('The form file could not be decrypted.');
  }
  if (!sameBytes(sha256(plain), Buffer.from(meta.plaintext_hash, 'base64')))
    throw new MediaTamperedError('The decrypted form file does not match its hash.');
  return plain;
}
