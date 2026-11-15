import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/** The AES-256 key from the secret (any length; SHA-256 makes it 32 bytes). */
const keyOf = (secret: string) => createHash('sha256').update(secret, 'utf8').digest();

/** Encrypts a JSON value with AES-256-GCM: `v1.<iv>.<tag>.<data>`, base64url. */
export function sealSecrets(secret: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** The value sealed by `sealSecrets`; throws when the key is wrong or the text was changed. */
export function openSecrets<T>(secret: string, sealed: string): T {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Unknown secrets format.');
  const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as T;
}

/** A random key for a webhook we set up on a platform (Google lead forms). */
export const randomKey = (bytes = 24) => randomBytes(bytes).toString('base64url');
