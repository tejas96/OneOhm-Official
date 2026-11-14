import type { DatabaseExecutor } from './client';
import type { Routed } from './customer-channel';
import { queueCustomerMessageAs } from './customer-message';

/** Meta's "re-engagement message" refusal: the 24-hour chat window has closed. */
export const WINDOW_CLOSED_ERROR_CODE = 131047;

/** The template a chat message falls back to when its 24-hour window turns out to be closed. */
export interface MessageFallback {
  readonly template: string;
  readonly payload: Record<string, string>;
  /** Defaults to `${row.dedupeKey}:fallback`, so the fallback is queued once. */
  readonly dedupeKey?: string;
}

/** A chat (`session:*`) payload that carries its template fallback. */
export function withFallback<T extends object>(
  sessionPayload: T,
  template: string,
  payload: Record<string, string>,
  dedupeKey?: string,
): T & { readonly fallback: MessageFallback } {
  return {
    ...sessionPayload,
    fallback: { template, payload, ...(dedupeKey !== undefined && { dedupeKey }) },
  };
}

/** The fallback an outbox payload carries, or null. */
export function fallbackOf(payload: unknown): MessageFallback | null {
  const found = (payload as { fallback?: Partial<MessageFallback> } | null)?.fallback;
  if (!found || typeof found.template !== 'string' || !found.payload) return null;
  return found as MessageFallback;
}

/**
 * Queues an outbox row's fallback template as a normal customer message (once: the
 * dedupe key is fixed). Returns what routing did, or null when the row has no fallback.
 */
export async function queueFallback(
  db: DatabaseExecutor,
  row: { readonly recipient: string; readonly dedupeKey: string; readonly payload: unknown },
): Promise<Routed | null> {
  const fallback = fallbackOf(row.payload);
  if (!fallback) return null;
  return queueCustomerMessageAs(
    db,
    row.recipient,
    fallback.template,
    fallback.payload,
    fallback.dedupeKey ?? `${row.dedupeKey}:fallback`,
  );
}
