import { describe, expect, it } from 'vitest';
import { detectFileType, safeFileName } from './file-type';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part,
    ),
  );

describe('detectFileType', () => {
  it('recognises the accepted formats by their bytes', () => {
    expect(detectFileType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectFileType(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectFileType(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('image/webp');
    expect(detectFileType(bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0]))).toBe('image/heic');
    expect(detectFileType(bytes('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('refuses anything else, whatever the name says', () => {
    expect(detectFileType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectFileType(bytes('MZ', [0x90, 0]))).toBeNull();
    expect(detectFileType(bytes([0, 0, 0, 24], 'ftypmp42', [0, 0, 0, 0]))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });
});

describe('safeFileName', () => {
  it('keeps names readable and safe', () => {
    expect(safeFileName('Roof photo (east) #1.jpg')).toBe('Roof-photo-east-1.jpg');
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileName('   ')).toBe('file');
  });
});
