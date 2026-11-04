import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptFormMedia, MediaTamperedError } from './media-decrypt';
import { encryptFormMedia } from './media-encrypt';

const sample = Buffer.from('A photo of a light bill, as bytes. '.repeat(40));
const hash = (data: Buffer) => createHash('sha256').update(data).digest('base64');

describe('form media decryption (AES-256-CBC + HMAC-SHA256)', () => {
  it('opens a file encrypted the way WhatsApp keeps it', () => {
    const { cdnFile, meta } = encryptFormMedia(sample);
    expect(decryptFormMedia(cdnFile, meta).equals(sample)).toBe(true);
  });

  it('opens a file whose size is not a multiple of the block (PKCS7 padding)', () => {
    const odd = Buffer.from('seventeen bytes!!');
    const { cdnFile, meta } = encryptFormMedia(odd);
    expect(decryptFormMedia(cdnFile, meta).equals(odd)).toBe(true);
  });

  it('refuses a file changed on the way (encrypted hash differs)', () => {
    const { cdnFile, meta } = encryptFormMedia(sample);
    const changed = Buffer.from(cdnFile);
    changed[5] = (changed[5] ?? 0) ^ 1;
    expect(() => decryptFormMedia(changed, meta)).toThrow(MediaTamperedError);
  });

  it('refuses a changed signature even when the encrypted hash was made to match', () => {
    const { cdnFile, meta } = encryptFormMedia(sample);
    const changed = Buffer.from(cdnFile);
    changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
    expect(() => decryptFormMedia(changed, { ...meta, encrypted_hash: hash(changed) })).toThrow(
      /signature/,
    );
  });

  it('refuses the wrong HMAC key', () => {
    const { cdnFile, meta } = encryptFormMedia(sample);
    const other = encryptFormMedia(sample).meta.hmac_key;
    expect(() => decryptFormMedia(cdnFile, { ...meta, hmac_key: other })).toThrow(/signature/);
  });

  it('refuses a plaintext that does not match its hash', () => {
    const { cdnFile, meta } = encryptFormMedia(sample);
    expect(() =>
      decryptFormMedia(cdnFile, { ...meta, plaintext_hash: hash(Buffer.from('other')) }),
    ).toThrow(/decrypted form file does not match/);
  });

  it('refuses a short file and bad keys', () => {
    const { cdnFile, meta } = encryptFormMedia(sample);
    expect(() => decryptFormMedia(Buffer.alloc(4), meta)).toThrow(MediaTamperedError);
    expect(() =>
      decryptFormMedia(cdnFile, { ...meta, encryption_key: Buffer.alloc(8).toString('base64') }),
    ).toThrow(/bad keys/);
  });
});
