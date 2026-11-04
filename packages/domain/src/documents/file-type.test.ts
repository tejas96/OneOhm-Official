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
    expect(detectFileType(bytes([0, 0, 0, 24], 'ftyp3gp4', [0, 0, 0, 0]))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });
});

const le = (value: number, size: number) =>
  Array.from({ length: size }, (_, index) => Math.floor(value / 256 ** index) % 256);

/** A stored ZIP: one local entry per name, each with its data (empty when none is given). */
const zipOf = (...entries: (string | [string, Uint8Array])[]) =>
  Uint8Array.from(
    entries.flatMap((entry) => {
      const [name, data] = typeof entry === 'string' ? [entry, new Uint8Array()] : entry;
      return [
        ...[0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ...le(0, 4),
        ...le(data.length, 4),
        ...le(data.length, 4),
        ...le(name.length, 2),
        ...le(0, 2),
        ...[...name].map((char) => char.charCodeAt(0)),
        ...data,
      ];
    }),
  );

describe('detectFileType Word and Excel', () => {
  it('recognises a Word file by its word/ entry and an Excel file by its xl/ entry', () => {
    expect(detectFileType(zipOf('[Content_Types].xml', '_rels/.rels', 'word/document.xml'))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(
      detectFileType(zipOf(['[Content_Types].xml', bytes('<Types/>')], 'xl/workbook.xml')),
    ).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('refuses any other ZIP, whatever the name says', () => {
    expect(detectFileType(zipOf('readme.txt'))).toBeNull();
    expect(detectFileType(zipOf('docs/word/notes.txt'))).toBeNull();
    expect(detectFileType(bytes('word/document.xml'))).toBeNull();
  });

  it('refuses a presentation that carries a Word file inside it', () => {
    const inner = zipOf('[Content_Types].xml', 'word/document.xml');
    expect(
      detectFileType(
        zipOf('[Content_Types].xml', 'ppt/presentation.xml', ['ppt/embeddings/a.docx', inner]),
      ),
    ).toBeNull();
    expect(detectFileType(zipOf(['ppt/embeddings/a.docx', inner]))).toBeNull();
  });
});

describe('safeFileName', () => {
  it('keeps names readable and safe', () => {
    expect(safeFileName('Roof photo (east) #1.jpg')).toBe('Roof-photo-east-1.jpg');
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileName('   ')).toBe('file');
  });
});
