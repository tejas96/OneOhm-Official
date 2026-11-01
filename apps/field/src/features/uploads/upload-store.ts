import type { UploadableFile } from '@oneohm/mobile-ui';
import { Directory, File, Paths } from 'expo-file-system';
import { parseQueue, type QueuedUpload } from './queue-logic';

/**
 * The phone's copy of evidence waiting to upload: each file is copied into the app's
 * own documents (the picker's cache can be cleared by the system) and the queue is a
 * small JSON file beside them. The browser preview uses `upload-store.web.ts`.
 */
function folder(): Directory {
  const directory = new Directory(Paths.document, 'pending-evidence');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

const queueFile = () => new File(folder(), 'queue.json');

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const extensionOf = (type: string) => EXTENSIONS[type] ?? 'bin';

export async function loadQueue(): Promise<QueuedUpload[]> {
  try {
    const file = queueFile();
    if (!file.exists) return [];
    return parseQueue(JSON.parse(await file.text()));
  } catch {
    return [];
  }
}

export async function saveQueue(items: readonly QueuedUpload[]): Promise<void> {
  await queueFile().write(JSON.stringify(items));
}

/** Copies a picked file into the app's documents; resolves with the kept copy's URI. */
export async function keepFile(id: string, file: UploadableFile): Promise<string> {
  const target = new File(folder(), `${id}.${extensionOf(file.type)}`);
  await new File(file.uri).copy(target);
  return target.uri;
}

/** Saves bytes made on the phone (the drawn signature) as a kept file. */
export async function keepBytes(id: string, bytes: Uint8Array, type: string): Promise<string> {
  const target = new File(folder(), `${id}.${extensionOf(type)}`);
  await target.write(bytes);
  return target.uri;
}

/** The kept file ready for `uploadFile`, or null when it is no longer on the phone. */
export async function uploadableFor(item: QueuedUpload): Promise<UploadableFile | null> {
  const file = new File(item.uri);
  return file.exists ? { uri: item.uri, name: item.name, type: item.type } : null;
}

/** What a thumbnail can show. */
export function previewUri(item: QueuedUpload): string {
  return item.uri;
}

export async function dropFile(item: QueuedUpload): Promise<void> {
  try {
    const file = new File(item.uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone; nothing to tidy.
  }
}
