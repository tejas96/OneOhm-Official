import type { Database } from '@oneohm/database';
import type { ProblemKind } from '../../care/care-taps';
import { chatDocumentFor } from '../chat-store';
import { pendingMedia } from './pending-media';

/** For this long after a request is raised, more photos sent are added to it. */
export const ADD_PHOTOS_MINUTES = 30;

/** What the chat remembers after raising a request, so the next photos join it. */
export interface RaisedRequest {
  readonly id: string;
  readonly at: number;
}

/** The request raised in this chat a moment ago, if photos may still join it. */
export function recentRequest(context: unknown, now: number): RaisedRequest | null {
  const raised = (context as { raised?: RaisedRequest } | null)?.raised;
  if (!raised?.id || typeof raised.at !== 'number') return null;
  return now - raised.at <= ADD_PHOTOS_MINUTES * 60_000 ? raised : null;
}

/** The service category each tap stands for: the customer's choice, never a guess from words. */
export const CATEGORY: Readonly<Record<ProblemKind, string>> = {
  inverter: 'inverter_error',
  nopower: 'no_generation',
  lowpower: 'low_generation',
  damage: 'physical_damage',
  cleaning: 'cleaning',
  bill: 'billing_net_meter',
  other: 'other',
};

/** The stored documents of photos sent before the questions (waiting in the chat). */
export async function waitingDocuments(db: Database, context: unknown): Promise<string[]> {
  const documents: string[] = [];
  for (const waiting of pendingMedia(context, Date.now())) {
    const id = await chatDocumentFor(db, waiting.id);
    if (id) documents.push(id);
  }
  return documents;
}
