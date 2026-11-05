import { type Database, homeNameOf } from '@oneohm/database';
import type { ProblemKind } from '../../care/care-taps';
import { promiseProblemCall } from '../../care/problem-call';
import { PROBLEM_WORDS } from '../../care/problem-words';
import { type Conversation, chatDocumentFor } from '../chat-store';
import { sayWithTaps } from './closing-taps';
import { pendingMedia } from './pending-media';
import { MEDIA_WORDS } from './words';

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

/** The reply of a raised report: who calls, by when; the call task behind that promise. */
export async function tellRaised(
  db: Database,
  chat: Conversation,
  given: {
    readonly customerId: string;
    readonly requestId: string;
    readonly projectId: string | null;
    readonly kind: ProblemKind;
    readonly timeZone: string;
  },
  skipped: boolean,
) {
  const { projectId, kind } = given;
  const call = await promiseProblemCall(db, { ...given, phone: chat.phone });
  const home = projectId ? await homeNameOf(db, projectId) : null;
  const lines = [
    PROBLEM_WORDS.saved(PROBLEM_WORDS.what[kind], home, call.name ?? PROBLEM_WORDS.team, call.when),
    skipped ? MEDIA_WORDS.photoNotAdded : '',
  ];
  return sayWithTaps(db, chat, lines.filter(Boolean).join('\n\n'), ['problems', 'menu']);
}
