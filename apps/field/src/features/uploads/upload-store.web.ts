import type { UploadableFile } from '@oneohm/mobile-ui';
import { parseQueue, type QueuedUpload } from './queue-logic';

/**
 * The browser preview's copy of evidence waiting to upload: files and the queue live in
 * IndexedDB, so a reload or a closed tab keeps them. When IndexedDB is unavailable
 * (some private windows) the queue lasts as long as the tab.
 */
const DATABASE = 'oneohm-field-uploads';
const FILES = 'files';
const STATE = 'state';
const QUEUE_KEY = 'queue';

const memory = { files: new Map<string, Blob>(), queue: [] as unknown };
/** Object URLs for thumbnails, made once per kept file. */
const previews = new Map<string, string>();

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(FILES);
        request.result.createObjectStore(STATE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (objects: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const keyOf = (item: Pick<QueuedUpload, 'uri'>) => item.uri.replace(/^idb:/, '');

async function readBlob(key: string): Promise<Blob | undefined> {
  const stored = await run<Blob>(FILES, 'readonly', (files) => files.get(key));
  return stored ?? memory.files.get(key);
}

function remember(key: string, blob: Blob): void {
  if (!previews.has(key)) previews.set(key, URL.createObjectURL(blob));
}

export async function loadQueue(): Promise<QueuedUpload[]> {
  const raw =
    (await run<unknown>(STATE, 'readonly', (state) => state.get(QUEUE_KEY))) ?? memory.queue;
  const items = parseQueue(raw);
  for (const item of items) {
    const blob = await readBlob(keyOf(item));
    if (blob) remember(keyOf(item), blob);
  }
  return items;
}

export async function saveQueue(items: readonly QueuedUpload[]): Promise<void> {
  memory.queue = items;
  await run(STATE, 'readwrite', (state) => state.put([...items], QUEUE_KEY));
}

async function keepBlob(id: string, blob: Blob): Promise<string> {
  memory.files.set(id, blob);
  await run(FILES, 'readwrite', (files) => files.put(blob, id));
  remember(id, blob);
  return `idb:${id}`;
}

export async function keepFile(id: string, file: UploadableFile): Promise<string> {
  const blob = file.file ?? (await (await fetch(file.uri)).blob());
  return keepBlob(id, blob);
}

export async function keepBytes(id: string, bytes: Uint8Array, type: string): Promise<string> {
  return keepBlob(id, new Blob([bytes as BlobPart], { type }));
}

export async function uploadableFor(item: QueuedUpload): Promise<UploadableFile | null> {
  const blob = await readBlob(keyOf(item));
  if (!blob) return null;
  return { uri: previews.get(keyOf(item)) ?? '', name: item.name, type: item.type, file: blob };
}

export function previewUri(item: QueuedUpload): string {
  return previews.get(keyOf(item)) ?? '';
}

export async function dropFile(item: QueuedUpload): Promise<void> {
  const key = keyOf(item);
  memory.files.delete(key);
  const preview = previews.get(key);
  if (preview) URL.revokeObjectURL(preview);
  previews.delete(key);
  await run(FILES, 'readwrite', (files) => files.delete(key)).catch(() => undefined);
}
