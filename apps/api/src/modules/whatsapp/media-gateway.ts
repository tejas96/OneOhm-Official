import { MAX_UPLOAD_BYTES } from '@oneohm/domain';
import type { Environment } from '../../config/environment';
import type { IncomingFile } from '../documents/upload-file';
import type { IncomingMedia } from './whatsapp-events';

export const WHATSAPP_MEDIA = Symbol('WHATSAPP_MEDIA');

/** A file the customer sent, fetched from WhatsApp. The bytes decide its real type later. */
export interface DownloadedMedia {
  readonly buffer: Buffer;
  readonly fileName: string;
}

/** A downloaded WhatsApp file, still knowing which chat message brought it. */
export interface ChatFile extends IncomingFile {
  readonly mediaId?: string;
}

export interface MediaGateway {
  readonly mode: 'log' | 'live';
  download(media: IncomingMedia): Promise<DownloadedMedia>;
}

/** A file larger than OneOhm accepts; nothing past the cap is read. */
export class MediaTooLargeError extends Error {}

/** A 1 × 1 PNG: the stand-in photo when WhatsApp is not live. */
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Stand-ins with the right bytes, so a voice note is kept as audio and a video as video. */
const SAMPLE_OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24), Buffer.from('OpusHead')]);
const SAMPLE_MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 16]),
  Buffer.from('ftypisom'),
  Buffer.alloc(4),
]);

/** A one-page blank PDF with a correct cross-reference table: the stand-in paper. */
export function samplePdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** A Word or Excel file stand-in: a ZIP of `[Content_Types].xml` and one `word/` or `xl/` entry. */
function sampleOffice(entry: string): Buffer {
  const names = ['[Content_Types].xml', entry];
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const label = Buffer.from(name, 'latin1');
    const head = Buffer.alloc(30);
    head.write('PK\x03\x04', 0, 'latin1');
    head.writeUInt16LE(label.length, 26);
    const index = Buffer.alloc(46);
    index.write('PK\x01\x02', 0, 'latin1');
    index.writeUInt16LE(label.length, 28);
    index.writeUInt32LE(offset, 42);
    local.push(head, label);
    central.push(index, label);
    offset += head.length + label.length;
  }
  const size = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.write('PK\x05\x06', 0, 'latin1');
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const EXTENSION: Readonly<Record<IncomingMedia['type'], string>> = {
  image: 'jpg',
  document: 'pdf',
  video: 'mp4',
  audio: 'ogg',
};

/** The name to file it under: the customer's own for papers, else "WhatsApp photo.jpg". */
export function mediaFileName(media: IncomingMedia): string {
  const given = media.fileName?.trim();
  if (given) return given;
  const label = media.type === 'image' ? 'photo' : media.type;
  return `WhatsApp ${label}.${EXTENSION[media.type]}`;
}

/** In log mode this media id stands in for a file over the size cap (used by the tests). */
export const SAMPLE_TOO_LARGE_ID = 'sample-too-large';

/** Local and test mode: nothing leaves the machine, and the flow still runs end to end. */
export function logMediaGateway(log: (line: string) => void): MediaGateway {
  return {
    mode: 'log',
    async download(media) {
      if (media.id === SAMPLE_TOO_LARGE_ID) throw new MediaTooLargeError('Stand-in large file.');
      log(`[whatsapp:log] media ${media.id} (${media.type}) stood in by a sample file`);
      // A paper named like a Word or Excel file stands in as one (the tests send those).
      const office = /\.(docx|xlsx)$/i.exec(media.fileName ?? '')?.[1]?.toLowerCase();
      const [buffer, extension] = {
        image: [Buffer.from(SAMPLE_PNG), 'png'],
        document: office
          ? [sampleOffice(office === 'docx' ? 'word/document.xml' : 'xl/workbook.xml'), office]
          : [samplePdf(), 'pdf'],
        audio: [SAMPLE_OGG, 'ogg'],
        video: [SAMPLE_MP4, 'mp4'],
      }[media.type] as [Buffer, string];
      const fileName = mediaFileName(media).replace(/\.[a-z0-9]{1,5}$/i, '');
      return { buffer, fileName: `${fileName}.${extension}` };
    },
  };
}

/** Reads a response body, refusing it once it passes `cap` bytes. */
async function readCapped(response: Response, cap: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > cap) throw new MediaTooLargeError(`File is ${declared} bytes.`);
  if (!response.body) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      throw new MediaTooLargeError(`File passed ${cap} bytes.`);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/**
 * WhatsApp Cloud API: ask Graph for the file's short-lived URL, then fetch it with the
 * same token. Files above OneOhm's upload cap are refused before they are read in full.
 */
export function liveMediaGateway(
  env: Pick<Environment, 'WHATSAPP_ACCESS_TOKEN' | 'WHATSAPP_API_VERSION'>,
  cap = MAX_UPLOAD_BYTES,
): MediaGateway {
  const headers = { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  return {
    mode: 'live',
    async download(media) {
      const meta = await fetch(
        `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${encodeURIComponent(media.id)}`,
        { headers, signal: AbortSignal.timeout(15_000) },
      );
      const info = (await meta.json().catch(() => ({}))) as { url?: string; file_size?: number };
      if (!meta.ok || !info.url) throw new Error(`WhatsApp media ${meta.status}: no file URL.`);
      if ((info.file_size ?? 0) > cap)
        throw new MediaTooLargeError(`File is ${info.file_size} bytes.`);
      const file = await fetch(info.url, { headers, signal: AbortSignal.timeout(60_000) });
      if (!file.ok) throw new Error(`WhatsApp media download ${file.status}.`);
      return { buffer: await readCapped(file, cap), fileName: mediaFileName(media) };
    },
  };
}

export function createMediaGateway(
  env: Environment,
  log: (line: string) => void = () => undefined,
): MediaGateway {
  return env.WHATSAPP_DELIVERY === 'live' ? liveMediaGateway(env) : logMediaGateway(log);
}
