import {
  customerNotice,
  type Database,
  type DatabaseExecutor,
  fallbackOf,
  GENERIC_WORDS,
  outbox,
  queueFallback,
  tellChatSendFailed,
  withFallback,
} from '@oneohm/database';
import { isNotOnWhatsApp } from '@oneohm/domain';
import { type MarketingConfig, metaTools } from '@oneohm/marketing';
import { and, eq, sql } from 'drizzle-orm';
import type { PushSender } from '../channels/expo-push';
import { MAYBE_SENT, PermanentSendError } from '../channels/send-errors';
import type { SmsSender } from '../channels/sms';
import type { SendResult, SessionMessage, WhatsAppSender } from '../channels/whatsapp-cloud';
import { logTemplateInChat } from './chat-history';
import { failPendingDelivery } from './fail-delivery';
import { queueFlowFallback } from './flow-fallback';
import { chatInsteadOfTemplate, windowOpenFor } from './in-window';
import { SOCIAL_MAYBE_SENT, sendSocialMessage } from './marketing/social-delivery';
import { fallBackNote } from './not-on-whatsapp';
import { type Prepared, prepareTemplate } from './prepare-template';
import { deliverPush } from './push-delivery';
import {
  alertTokenExpired,
  CHAT_WINDOW_CLOSED,
  smsCanStandIn,
  WINDOW_CLOSED_CODE,
} from './send-checks';

/** Written just before the provider call; found on entry, the last attempt died mid-send. */
export const SENDING = 'sending';

export type DeliveryOutcome = 'sent' | 'skipped' | 'failed' | 'not_pending';

interface DeliveryDeps {
  readonly db: Database;
  readonly sender: WhatsAppSender;
  readonly push: PushSender;
  readonly sms: SmsSender;
  readonly language: string;
  /** Instagram and Messenger replies go through Meta; without it they fail in plain words. */
  readonly marketing?: MarketingConfig;
}

/** Thrown inside a send to end it as skipped (not failed) with this note. */
class NotSent extends Error {}

/** The plain words of a customer message, for its SMS version. */
const wordsFor = (template: string, payload: Record<string, string>) =>
  customerNotice(template, payload, 'sms') ?? GENERIC_WORDS;

/** The note on a chat message that a template took the place of. */
const SENT_AS_TEMPLATE = ' It was sent as a template message instead.';

/** Why a message was only logged: log mode, or a number outside the test list. */
const loggedNote = (channel: string, result: { readonly note?: string }) =>
  result.note ?? `Not sent: ${channel === 'sms' ? 'SMS' : 'WhatsApp'} delivery is in log mode.`;

/**
 * Sends one queued message. Final outcomes (sent, skipped, failed) are written to the
 * outbox row; temporary failures throw so Temporal retries with backoff.
 */
export function deliveryActivities({ db, sender, push, sms, language, marketing }: DeliveryDeps) {
  const finish = async (
    id: string,
    status: 'sent' | 'skipped' | 'failed',
    note: string | null,
    providerMessageId: string | null = null,
    executor: DatabaseExecutor = db,
  ) => {
    await executor
      .update(outbox)
      .set({
        status,
        lastError: note,
        ...(status === 'sent'
          ? { sentAt: new Date(), providerMessageId, deliveryStatus: 'sent' }
          : {}),
      })
      .where(eq(outbox.id, id));
  };

  /** A message in a chat that never arrived tells the chat's people; a bad token tells admins. */
  const failWithAlerts = (id: string, reason: string, tokenInvalid = false) =>
    db.transaction(async (tx) => {
      await finish(id, 'failed', reason, null, tx);
      await tellChatSendFailed(tx, id);
      await queueFlowFallback(tx, id, reason);
      if (tokenInvalid) await alertTokenExpired(tx);
    });

  /**
   * A chat message the 24-hour window cannot carry goes as its fallback template instead:
   * queued once (fixed dedupe key), and this row is skipped, not failed. False: no fallback.
   */
  const useFallback = async (row: typeof outbox.$inferSelect, why: string) => {
    if (!fallbackOf(row.payload)) return false;
    await db.transaction(async (tx) => {
      await queueFallback(tx, row);
      await finish(row.id, 'skipped', `${why}${SENT_AS_TEMPLATE}`, null, tx);
    });
    return true;
  };

  /** `call` may say what it really sent (a chat message instead of the template) for the chat log. */
  const send = async (
    row: typeof outbox.$inferSelect,
    call: () => Promise<SendResult & { readonly sentText?: string }>,
  ) => {
    await db.update(outbox).set({ lastError: SENDING }).where(eq(outbox.id, row.id));
    try {
      const result = await call();
      if (result.outcome === 'logged') {
        await finish(row.id, 'skipped', loggedNote(row.channel, result));
        return 'skipped';
      }
      await finish(row.id, 'sent', null, result.providerId);
      if (row.channel === 'whatsapp')
        await logTemplateInChat(db, row, 'sentText' in result ? result.sentText : undefined).catch(
          () => undefined,
        );
      return 'sent';
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof NotSent) {
        await finish(row.id, 'skipped', reason);
        return 'skipped';
      }
      if (error instanceof PermanentSendError) {
        if (error.code === WINDOW_CLOSED_CODE && (await useFallback(row, CHAT_WINDOW_CLOSED)))
          return 'skipped';
        // Not on WhatsApp: customer news goes by SMS (later ones SMS first); staff ones fail.
        const viaSms = row.channel === 'whatsapp' && smsCanStandIn(row.template);
        if (viaSms && isNotOnWhatsApp(error.code)) {
          await finish(row.id, 'skipped', await fallBackNote(db, row.id, wordsFor));
          return 'skipped';
        }
        await failWithAlerts(row.id, reason, error.tokenInvalid);
        return 'failed';
      }
      await db.update(outbox).set({ lastError: reason }).where(eq(outbox.id, row.id));
      throw error;
    }
  };

  return {
    async deliverOutboxMessage(id: string): Promise<DeliveryOutcome> {
      const [current] = await db.select().from(outbox).where(eq(outbox.id, id));
      if (current?.status !== 'pending') return 'not_pending';
      // The provider may have the message already: never send it a second time.
      if (current.lastError === SENDING) {
        const social = current.channel === 'instagram' || current.channel === 'messenger';
        await failWithAlerts(id, social ? SOCIAL_MAYBE_SENT : MAYBE_SENT);
        return 'failed';
      }
      // Claimed in one statement, so a step update cannot be merged into a row being sent.
      const [row] = await db
        .update(outbox)
        .set({ attempts: sql`${outbox.attempts} + 1`, startedAt: new Date() })
        .where(and(eq(outbox.id, id), eq(outbox.status, 'pending')))
        .returning();
      if (!row) return 'not_pending';
      if (row.channel === 'push') {
        const outcome = await deliverPush(db, push, row.recipient);
        await finish(id, outcome.status, outcome.note);
        return outcome.status;
      }
      if (row.channel === 'instagram' || row.channel === 'messenger') {
        await db.update(outbox).set({ lastError: SENDING }).where(eq(outbox.id, id));
        try {
          const tools = marketing ? await metaTools(db, marketing) : null;
          const sent = await sendSocialMessage(tools, row);
          if (sent.status === 'sent') {
            await finish(id, 'sent', null, sent.messageId);
            return 'sent';
          }
          await failWithAlerts(id, sent.reason);
          return 'failed';
        } catch (error) {
          await db
            .update(outbox)
            .set({ lastError: error instanceof Error ? error.message : String(error) })
            .where(eq(outbox.id, id));
          throw error;
        }
      }
      if (row.channel === 'sms') {
        const text = (row.payload as { text?: string } | null)?.text;
        if (!text) {
          await finish(id, 'failed', 'No SMS text was written for this message.');
          return 'failed';
        }
        return send(row, () => sms.send(row.recipient, text));
      }
      if (row.template.startsWith('session:')) {
        if (!(await windowOpenFor(db, row.recipient))) {
          if (await useFallback(row, CHAT_WINDOW_CLOSED)) return 'skipped';
          await failWithAlerts(id, CHAT_WINDOW_CLOSED);
          return 'failed';
        }
        return send(row, () => sender.sendSession(row.recipient, row.payload as SessionMessage));
      }
      // A Marathi or Hindi customer with no template in their language, chat open: a chat message.
      const chat = await chatInsteadOfTemplate(db, row);
      const viaTemplate = (prepared: Prepared): Promise<SendResult> =>
        sender.send({
          toE164: row.recipient,
          template: prepared.name,
          language: prepared.language,
          parameters: prepared.parameters,
          ...(prepared.header && { header: prepared.header }),
          ...(prepared.buttons && { buttons: prepared.buttons }),
        });
      if (!chat) {
        const prepared = await prepareTemplate(db, language, row);
        if (prepared.verdict !== 'send') {
          await finish(id, prepared.verdict, prepared.note);
          return prepared.verdict;
        }
        return send(row, () => viaTemplate(prepared));
      }
      // Meta may still report the closed window later (a receipt): keep the template for that.
      const { fallback: _kept, ...original } = row.payload as Record<string, unknown>;
      const converted = withFallback(original, row.template, original as Record<string, string>);
      await db.update(outbox).set({ payload: converted }).where(eq(outbox.id, id));
      return send(row, async () => {
        try {
          const sent = await sender.sendSession(row.recipient, chat.message);
          return { ...sent, sentText: chat.text };
        } catch (error) {
          // The window closed just now: Meta refuses the chat message, so the template goes.
          if (!(error instanceof PermanentSendError) || error.code !== WINDOW_CLOSED_CODE)
            throw error;
          const prepared = await prepareTemplate(db, language, row);
          if (prepared.verdict === 'skipped') throw new NotSent(prepared.note);
          if (prepared.verdict !== 'send') throw new PermanentSendError(prepared.note);
          return viaTemplate(prepared);
        }
      });
    },

    /** Called once retries run out, so the failure is visible to the office. */
    markOutboxFailed: (id: string, reason: string) => failPendingDelivery(db, id, reason),
  };
}
