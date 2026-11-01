import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { uniqueNames, zip } from './zip-writer';

describe('zip', () => {
  it('makes an archive the system unzip can read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oneohm-zip-'));
    const file = join(dir, 'test.zip');
    writeFileSync(
      file,
      zip([
        { name: 'a.txt', data: Buffer.from('hello') },
        { name: 'folder/b.txt', data: Buffer.from('नमस्ते') },
      ]),
    );
    execFileSync('unzip', ['-q', '-o', file, '-d', dir]);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('hello');
    expect(readFileSync(join(dir, 'folder', 'b.txt'), 'utf8')).toBe('नमस्ते');
  });

  it('marks names as UTF-8 so Marathi and Hindi file names survive', () => {
    const archive = zip([{ name: 'बिल.pdf', data: Buffer.from('x') }]);
    expect(archive.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(archive.subarray(30, 30 + Buffer.byteLength('बिल.pdf')).toString('utf8')).toBe(
      'बिल.pdf',
    );
  });

  it('keeps names unique and safe', () => {
    expect(uniqueNames(['Bill.pdf', 'bill.pdf', 'a/b.png'])).toEqual([
      'Bill.pdf',
      'bill (2).pdf',
      'a-b.png',
    ]);
  });
});
