import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { Actor } from '../../common/auth/actor';
import { DocumentsService } from './documents.service';
import { uniqueNames, zip } from './zip-writer';

const A4 = { width: 595.28, height: 841.89, margin: 36 } as const;

async function toBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Embeds a photo by what its bytes are, not its label; null when it is not a usable PNG/JPEG. */
async function embedImage(out: PDFDocument, data: Buffer) {
  try {
    if (data.subarray(0, 4).toString('hex') === '89504e47') return await out.embedPng(data);
    if (data[0] === 0xff && data[1] === 0xd8) return await out.embedJpg(data);
  } catch {
    // A damaged picture is listed on the last page instead of failing the whole bundle.
  }
  return null;
}

async function copyPdf(out: PDFDocument, data: Buffer): Promise<boolean> {
  try {
    const source = await PDFDocument.load(data, { ignoreEncryption: true });
    for (const page of await out.copyPages(source, source.getPageIndices())) out.addPage(page);
    return true;
  } catch {
    return false;
  }
}

interface Loaded {
  readonly name: string;
  readonly type: string;
  readonly data: Buffer;
}

/**
 * Many documents in one download (PRD 3.14): a ZIP, or one PDF for printing. Every file
 * goes through the same access check as opening it on its own.
 */
@Injectable()
export class DocumentBundleService {
  constructor(private readonly documents: DocumentsService) {}

  async load(actor: Actor, ids: readonly string[]): Promise<Loaded[]> {
    const files: Loaded[] = [];
    for (const id of new Set(ids)) {
      const file = await this.documents.file(actor, id);
      files.push({ name: file.name, type: file.type, data: await toBuffer(file.body) });
    }
    return files;
  }

  zip(files: readonly Loaded[]): Buffer {
    const names = uniqueNames(files.map((file) => file.name));
    return zip(files.map((file, index) => ({ name: names[index] ?? file.name, data: file.data })));
  }

  /** PDFs keep their pages; photos become one A4 page each; anything else is listed at the end. */
  async pdf(files: readonly Loaded[]): Promise<Buffer> {
    const out = await PDFDocument.create();
    const skipped: string[] = [];
    for (const file of files) {
      if (file.type === 'application/pdf') {
        if (!(await copyPdf(out, file.data))) skipped.push(file.name);
        continue;
      }
      const image = await embedImage(out, file.data);
      if (!image) {
        skipped.push(file.name);
        continue;
      }
      const page = out.addPage([A4.width, A4.height]);
      const room = { width: A4.width - 2 * A4.margin, height: A4.height - 2 * A4.margin };
      const scale = Math.min(room.width / image.width, room.height / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: (A4.width - width) / 2,
        y: (A4.height - height) / 2,
        width,
        height,
      });
    }
    if (skipped.length > 0) {
      const font = await out.embedFont(StandardFonts.Helvetica);
      const page = out.addPage([A4.width, A4.height]);
      const lines = [
        'Not included (not a readable PDF or photo):',
        ...skipped.map((name) => `- ${name}`),
      ];
      for (const [index, line] of lines.entries()) {
        page.drawText(line.replace(/[^\x20-\x7E]/g, '?'), {
          x: A4.margin,
          y: A4.height - A4.margin - index * 16,
          size: 11,
          font,
        });
      }
    }
    if (out.getPageCount() === 0) out.addPage([A4.width, A4.height]);
    return Buffer.from(await out.save());
  }
}
