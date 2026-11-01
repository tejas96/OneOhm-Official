import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import type { Session } from './http';

let photoBytes: Buffer | null = null;
let pdfBytes: Buffer | null = null;

/** A real 320×240 PNG, so thumbnails and photo checks behave as with a phone photo. */
export async function testPhoto(): Promise<Buffer> {
  photoBytes ??= await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 240, g: 140, b: 30 } },
  })
    .png()
    .toBuffer();
  return photoBytes;
}

/** A one-page PDF that says it is test data. */
export async function testPdf(): Promise<Buffer> {
  if (pdfBytes) return pdfBytes;
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('OneOhm acceptance test document (test)', { x: 40, y: 150, size: 14, font });
  pdfBytes = Buffer.from(await doc.save());
  return pdfBytes;
}

export type FileKind = 'photo' | 'document' | 'signature';

const KINDS: Record<FileKind, { category: string; name: string; type: string }> = {
  photo: { category: 'site_photo', name: 'site-photo-test.png', type: 'image/png' },
  document: { category: 'other', name: 'paper-test.pdf', type: 'application/pdf' },
  signature: { category: 'customer_signature', name: 'signature-test.png', type: 'image/png' },
};

/** Multipart body with the file in `file` and the given fields. */
export async function fileForm(kind: FileKind, fields: Record<string, string>): Promise<FormData> {
  const spec = KINDS[kind];
  const bytes = kind === 'document' ? await testPdf() : await testPhoto();
  const form = new FormData();
  for (const [key, value] of Object.entries({ category: spec.category, ...fields })) {
    form.set(key, value);
  }
  form.set('file', new Blob([new Uint8Array(bytes)], { type: spec.type }), spec.name);
  return form;
}

/** Uploads one file to POST /documents (task evidence or a project paper). */
export async function upload<T = { id: string }>(
  who: Session,
  kind: FileKind,
  fields: Record<string, string>,
): Promise<T> {
  return who.post<T>('/documents', await fileForm(kind, { name: `${kind} (test)`, ...fields }));
}
