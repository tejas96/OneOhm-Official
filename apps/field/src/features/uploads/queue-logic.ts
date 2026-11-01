import { z } from 'zod';

/** What a queued file is evidence of; decides its document category and its tile. */
export const UPLOAD_KINDS = ['photo', 'document', 'signature', 'video', 'voice'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

/**
 * Where and when a photo was taken: from its EXIF when the picker gives it, or the
 * phone's location at capture (`device`). Coordinates are null when location is not
 * shared; the time is still kept.
 */
export interface Geotag {
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** EXIF local time ("2026-11-01T10:22:33", India) or an instant with its offset. */
  readonly takenAt: string | null;
  readonly accuracyM?: number | null | undefined;
  readonly source?: 'exif' | 'device' | undefined;
}

/**
 * One file waiting to reach OneOhm. Kept on the phone (the file copied into the app's
 * own storage, this record in a small store) so it survives the app being closed.
 */
export interface QueuedUpload {
  readonly id: string;
  /** Whose upload it is; another person signing in on the phone never sends it. */
  readonly userId: string;
  /** Evidence for a task, or (`serviceRequestId`) for a service visit (PRD 5.5). */
  readonly taskId?: string | undefined;
  readonly serviceRequestId?: string | undefined;
  /**
   * A paper for a lead, a customer or one of their sites (PRD 4.5: bills, ID proof).
   * A lead's paper is kept on the lead's customer and site by the server.
   */
  readonly leadId?: string | undefined;
  readonly customerId?: string | undefined;
  readonly propertyId?: string | undefined;
  readonly kind: UploadKind;
  readonly category: string;
  readonly name: string;
  readonly type: string;
  /** The kept copy: a file in the app's documents, or a key in the browser's store. */
  readonly uri: string;
  /** Sent with the file; the server keeps the coordinates only with consent. */
  readonly geotag: Geotag | null;
  readonly attempts: number;
  /** The last failure, shown on the tile; null while it waits or sends. */
  readonly error: string | null;
  /** The failure was passing (no signal, server busy): it tries again by itself. */
  readonly autoRetry: boolean;
  /** When the next automatic try is due (ms since epoch). */
  readonly retryAt: number | null;
  readonly createdAt: number;
}

/** Waits between automatic tries; the last one repeats until the upload succeeds. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;
/** Uploads at once; more queue behind them so a weak signal is not split many ways. */
export const MAX_PARALLEL = 2;

export function retryDelay(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[index] ?? 60_000;
}

/**
 * No signal (0), an expired session, a timeout, rate limiting or a server hiccup can
 * pass; a refused file (too big, wrong type, task no longer theirs) cannot.
 */
export function isPassing(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

export interface Failure {
  readonly status: number;
  readonly message: string;
}

export function afterFailure(item: QueuedUpload, failure: Failure, now: number): QueuedUpload {
  const attempts = item.attempts + 1;
  const autoRetry = isPassing(failure.status);
  return {
    ...item,
    attempts,
    error: failure.message,
    autoRetry,
    retryAt: autoRetry ? now + retryDelay(attempts) : null,
  };
}

/** Tapped "Retry": send it on the next pass, whatever failed before. */
export function retriedNow(item: QueuedUpload): QueuedUpload {
  return { ...item, error: null, autoRetry: false, retryAt: null };
}

/** Back online or back in the app: passing failures try again straight away. */
export function wakeAll(items: readonly QueuedUpload[], now: number): QueuedUpload[] {
  return items.map((item) =>
    item.autoRetry && item.retryAt !== null ? { ...item, retryAt: now } : item,
  );
}

const isDue = (item: QueuedUpload, now: number) =>
  item.error === null || (item.autoRetry && item.retryAt !== null && item.retryAt <= now);

/** The person's uploads to start now, oldest first, within the parallel limit. */
export function readyToSend(
  items: readonly QueuedUpload[],
  options: { readonly userId: string; readonly now: number; readonly sending: ReadonlySet<string> },
): QueuedUpload[] {
  const room = MAX_PARALLEL - options.sending.size;
  if (room <= 0) return [];
  return items
    .filter((item) => item.userId === options.userId && !options.sending.has(item.id))
    .filter((item) => isDue(item, options.now))
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(0, room);
}

/** When the next automatic try falls due, to wake the queue then; null when none waits. */
export function nextWake(
  items: readonly QueuedUpload[],
  userId: string,
  now: number,
): number | null {
  const times = items
    .filter((item) => item.userId === userId && item.autoRetry && item.retryAt !== null)
    .map((item) => Math.max(item.retryAt ?? now, now));
  return times.length > 0 ? Math.min(...times) : null;
}

type Target = Pick<QueuedUpload, 'taskId' | 'serviceRequestId' | 'leadId' | 'customerId'>;

/** Where a queued file goes: a task, a service visit, a lead, or a customer (and site). */
export function hasTarget(item: Target): boolean {
  return Boolean(item.taskId || item.serviceRequestId || item.leadId || item.customerId);
}

/**
 * The screen a queued file belongs to: its task, service visit or lead. A customer's
 * paper has no screen of its own in the app, so it opens Today.
 */
export function screenOf(item: Target): string {
  if (item.serviceRequestId) return `/service/${item.serviceRequestId}`;
  if (item.taskId) return `/tasks/${item.taskId}`;
  if (item.leadId) return `/leads/${item.leadId}`;
  return '/';
}

export function mine(
  items: readonly QueuedUpload[],
  userId: string,
  taskId?: string,
): QueuedUpload[] {
  return items.filter(
    (item) => item.userId === userId && (taskId === undefined || item.taskId === taskId),
  );
}

/** Still on its way (not refused): the task waits for it before it can complete. */
export const onItsWay = (item: QueuedUpload) => item.error === null || item.autoRetry;

const geotagSchema = z.object({
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  takenAt: z.string().nullable(),
  accuracyM: z.number().nullable().optional(),
  source: z.enum(['exif', 'device']).optional(),
});

const queuedSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  serviceRequestId: z.string().min(1).optional(),
  leadId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  kind: z.enum(UPLOAD_KINDS),
  category: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  uri: z.string().min(1),
  geotag: geotagSchema.nullable(),
  attempts: z.number().int().min(0),
  error: z.string().nullable(),
  autoRetry: z.boolean(),
  retryAt: z.number().nullable(),
  createdAt: z.number(),
});

/**
 * The saved queue, read back after a restart. Anything unreadable is dropped; an upload
 * that was sending when the app closed simply goes again.
 */
export function parseQueue(raw: unknown): QueuedUpload[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = queuedSchema.safeParse(entry);
    // Every file belongs somewhere (task, visit, lead, customer); one with nowhere is dropped.
    return parsed.success && hasTarget(parsed.data) ? [parsed.data] : [];
  });
}

let sequence = 0;

export function uploadId(now: number): string {
  sequence += 1;
  return `up-${now.toString(36)}-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
}
