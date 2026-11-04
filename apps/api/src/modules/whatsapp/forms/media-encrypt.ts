import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import type { EncryptionMetadata } from './media-decrypt';

/**
 * Encrypts a file the way WhatsApp keeps a form upload (the reverse of `decryptFormMedia`).
 * Used by the log-mode gateway and the tests, never to send anything to WhatsApp. Keys are
 * random unless given, so a test can repeat a sample.
 */
export function encryptFormMedia(
  plain: Buffer,
  keys: { key?: Buffer; hmacKey?: Buffer; iv?: Buffer } = {},
): { cdnFile: Buffer; meta: EncryptionMetadata } {
  const key = keys.key ?? randomBytes(32);
  const hmacKey = keys.hmacKey ?? randomBytes(32);
  const iv = keys.iv ?? randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const cipherText = Buffer.concat([cipher.update(plain), cipher.final()]);
  const mac = createHmac('sha256', hmacKey).update(iv).update(cipherText).digest().subarray(0, 10);
  const cdnFile = Buffer.concat([cipherText, mac]);
  const hash = (data: Buffer) => createHash('sha256').update(data).digest('base64');
  return {
    cdnFile,
    meta: {
      encryption_key: key.toString('base64'),
      hmac_key: hmacKey.toString('base64'),
      iv: iv.toString('base64'),
      plaintext_hash: hash(plain),
      encrypted_hash: hash(cdnFile),
    },
  };
}
