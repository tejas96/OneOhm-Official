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

type Entry = string | [string, Uint8Array];

/**
 * A stored ZIP: a local entry per name (with its data, empty when none is given), then the
 * central directory and its end record. `streamed` writes sizes the way streaming writers
 * do: after the data, with zero sizes in the local header and bit 3 set.
 */
function zipOf(entries: Entry[], { streamed = false } = {}): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  for (const entry of entries) {
    const [name, data] = typeof entry === 'string' ? [entry, new Uint8Array()] : entry;
    const sizes = streamed ? 0 : data.length;
    const flags = streamed ? 8 : 0;
    const label = [...name].map((char) => char.charCodeAt(0));
    central.push(
      ...[0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, flags, 0, 0, 0, 0, 0, 0, 0],
      ...le(0, 4),
      ...le(data.length, 4),
      ...le(data.length, 4),
      ...le(name.length, 2),
      ...le(0, 12),
      ...le(local.length, 4),
      ...label,
    );
    local.push(
      ...[0x50, 0x4b, 0x03, 0x04, 20, 0, flags, 0, 0, 0, 0, 0, 0, 0],
      ...le(0, 4),
      ...le(sizes, 4),
      ...le(sizes, 4),
      ...le(name.length, 2),
      ...le(0, 2),
      ...label,
      ...data,
      ...(streamed ? [...le(0, 4), ...le(data.length, 4), ...le(data.length, 4)] : []),
    );
  }
  const end = [
    ...[0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0],
    ...le(entries.length, 2),
    ...le(entries.length, 2),
    ...le(central.length, 4),
    ...le(local.length, 4),
    ...le(0, 2),
  ];
  return Uint8Array.from([...local, ...central, ...end]);
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('detectFileType Word and Excel', () => {
  it('recognises a Word file by its word/ entry and an Excel file by its xl/ entry', () => {
    expect(detectFileType(zipOf(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']))).toBe(
      DOCX,
    );
    expect(
      detectFileType(zipOf([['[Content_Types].xml', bytes('<Types/>')], 'xl/workbook.xml'])),
    ).toBe(XLSX);
  });

  it('recognises a file from a streaming writer: sizes after the data, bit 3 set', () => {
    const word = ['[Content_Types].xml', ['word/document.xml', bytes('<w:document/>')]] as Entry[];
    expect(detectFileType(zipOf(word, { streamed: true }))).toBe(DOCX);
    expect(
      detectFileType(zipOf(['[Content_Types].xml', 'xl/workbook.xml'], { streamed: true })),
    ).toBe(XLSX);
  });

  it('refuses any other ZIP, whatever the name says', () => {
    expect(detectFileType(zipOf(['readme.txt']))).toBeNull();
    expect(detectFileType(zipOf(['[Content_Types].xml', 'docs/word/notes.txt']))).toBeNull();
    expect(detectFileType(zipOf(['word/document.xml']))).toBeNull();
    expect(detectFileType(bytes('word/document.xml'))).toBeNull();
    // Cut short: no end record to read.
    expect(
      detectFileType(zipOf(['[Content_Types].xml', 'word/document.xml']).slice(0, 80)),
    ).toBeNull();
  });

  it('refuses a presentation that carries a Word file inside it', () => {
    const inner = zipOf(['[Content_Types].xml', 'word/document.xml']);
    const deck: Entry[] = [
      '[Content_Types].xml',
      'ppt/presentation.xml',
      ['ppt/embeddings/a.docx', inner],
    ];
    expect(detectFileType(zipOf(deck))).toBeNull();
    expect(detectFileType(zipOf(deck, { streamed: true }))).toBeNull();
  });
});

describe('safeFileName', () => {
  it('keeps names readable and safe', () => {
    expect(safeFileName('Roof photo (east) #1.jpg')).toBe('Roof-photo-east-1.jpg');
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileName('   ')).toBe('file');
  });
});
