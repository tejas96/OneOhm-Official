import { crc32 } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

/** DOS date/time for the zip headers. */
function dosTime(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * A plain ZIP archive with stored (uncompressed) entries: PDFs and photos are already
 * compressed, so storing keeps it fast and simple. Names are UTF-8.
 */
export function zip(entries: readonly ZipEntry[], now = new Date()): Buffer {
  const { time, day } = dosTime(now);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data) >>> 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(0, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(day, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(entry.data.length, 18);
    head.writeUInt32LE(entry.data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, name, entry.data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(entry.data.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += head.length + name.length + entry.data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

/** Unique, safe file names inside the archive: "Bill.pdf", "Bill (2).pdf"… */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const name = raw.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document';
    const count = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), count);
    if (count === 1) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
  });
}
