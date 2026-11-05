import {
  type DatabaseExecutor,
  homeNameOf,
  noticeCustomer,
  waConversations,
} from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { languageOfPhone } from '../documents/document-request-messages';
import { confirmWords } from '../journey/confirm-words';
import { cancelConfirm } from '../journey/journey-confirm';
import { cancelSignedCopy } from '../journey/journey-signature';
import { JOURNEY_WORDS } from '../journey/journey-words';
import { inLanguage } from '../whatsapp/assistant/language';
import { queueReply } from '../whatsapp/chat-store';
import { chatOpenFor } from './send-context';
import { SEND_WORDS } from './send-words';

/**
 * The team cancelled a location ask, a payment-proof ask or a call-back ask: the customer is
 * told once, in their language: in the app inbox, and in the chat while its window is open
 * (redesign §2.3: "cancel tells the customer").
 */
export async function tellActionCancelled(
  tx: DatabaseExecutor,
  action: {
    readonly id: string;
    readonly type: 'location' | 'pay' | 'callback' | 'visit_pick' | 'signature' | 'confirm';
    readonly projectId: string | null;
    readonly propertyId: string | null;
    /** The paper a cancelled signature ask was for. */
    readonly paper?: string;
    /** Which question a cancelled confirm ask was. */
    readonly kind?: string;
  },
  phone: string,
  userId: string,
): Promise<void> {
  const language = await languageOfPhone(tx, phone);
  await inLanguage(language, async () => {
    const key = `action_cancelled:${action.id}`;
    await noticeCustomer(
      tx,
      phone,
      'action_cancelled',
      {
        what: whatOf(action),
        ...(action.type === 'pay' ? { note: SEND_WORDS.cancelled.stillDue } : {}),
      },
      key,
    );
    const [chat] = await tx
      .select()
      .from(waConversations)
      .where(eq(waConversations.phone, phone))
      .limit(1);
    if (!chat || !(await chatOpenFor(tx, phone))) return;
    const words = SEND_WORDS.cancelled;
    const body =
      action.type === 'location'
        ? words.location(await homeNameOf(tx, action.projectId, action.propertyId))
        : action.type === 'signature'
          ? JOURNEY_WORDS.sign.cancelled(action.paper ?? JOURNEY_WORDS.sign.what)
          : action.type === 'confirm'
            ? confirmWords(action.kind ?? '').cancelled
            : words[action.type];
    await queueReply(tx, chat, { kind: 'text', body }, userId, key);
  });
}

/** What a cancelled ask was about, in the customer's language ("your payment proof is no longer needed"). */
function whatOf(action: {
  readonly type: string;
  readonly paper?: string;
  readonly kind?: string;
}): string {
  if (action.type === 'signature') return action.paper ?? JOURNEY_WORDS.sign.what;
  if (action.type === 'confirm') return confirmWords(action.kind ?? '').what;
  return SEND_WORDS.cancelled.what[action.type as keyof typeof SEND_WORDS.cancelled.what];
}

const TOLD = ['location', 'pay', 'callback', 'visit_pick', 'signature', 'confirm'] as const;

type CancelledAsk = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly projectId: string | null;
  readonly propertyId: string | null;
  readonly payload: Record<string, unknown>;
};

/** What a cancelled ask takes with it: a signed copy still waiting goes, a roof wait ends. Tells nobody. */
export async function settleCancelledAsk(
  tx: DatabaseExecutor,
  ask: CancelledAsk,
  userId: string,
): Promise<void> {
  if (ask.type === 'signature') await cancelSignedCopy(tx, ask, userId);
  if (ask.type === 'confirm') await cancelConfirm(tx, ask);
}

/** The team cancelled an ask that is not a paper: what it took with it is settled, the customer is told. */
export async function tellAskCancelled(
  tx: DatabaseExecutor,
  ask: CancelledAsk,
  phone: string,
  userId: string,
): Promise<void> {
  const type = TOLD.find((one) => one === ask.type);
  if (!type) return;
  await settleCancelledAsk(tx, ask, userId);
  const paper = String(ask.payload.paperTitle ?? ask.title);
  await tellActionCancelled(
    tx,
    {
      id: ask.id,
      type,
      projectId: ask.projectId,
      propertyId: ask.propertyId,
      ...(type === 'signature' ? { paper } : {}),
      ...(type === 'confirm' ? { kind: String(ask.payload.kind ?? '') } : {}),
    },
    phone,
    userId,
  );
}
