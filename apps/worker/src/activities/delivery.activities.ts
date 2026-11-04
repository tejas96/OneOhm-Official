import {
  customerNotice,
  customers,
  type Database,
  type DatabaseExecutor,
  fallBackToSms,
  GENERIC_WORDS,
  messageTemplates,
  outbox,
  tellChatSendFailed,
  waConversations,
} from '@oneohm/database';
import { chatWindowOpen, isNotOnWhatsApp } from '@oneohm/domain';
import { eq, sql } from 'drizzle-orm';
import type { PushSender } from '../channels/expo-push';
import {
  approvedMessage,
  MESSAGE_TEMPLATES,
  MissingFieldError,
} from '../channels/message-templates';
import { MAYBE_SENT, PermanentSendError } from '../channels/send-errors';
import type { SmsSender } from '../channels/sms';
import type {
  SendResult,
  SessionMessage,
  TemplateButton,
  TemplateHeader,
  WhatsAppSender,
} from '../channels/whatsapp-cloud';
import { logTemplateInChat } from './chat-history';
import { failPendingDelivery } from './fail-delivery';
import { queueFlowFallback } from './flow-fallback';
import { deliverPush } from './push-delivery';
import { alertTokenExpired, CHAT_WINDOW_CLOSED, smsCanStandIn } from './send-checks';

/** Written just before the provider call; found on entry, the last attempt died mid-send. */
export const SENDING = 'sending';

const OPTED_OUT_NOTE = 'The person asked not to get WhatsApp messages';
export type DeliveryOutcome = 'sent' | 'skipped' | 'failed' | 'not_pending';

interface DeliveryDeps {
  readonly db: Database;
  readonly sender: WhatsAppSender;
  readonly push: PushSender;
  readonly sms: SmsSender;
  readonly language: string;
}

/** The plain words of a customer message, for its SMS version. */
const wordsFor = (template: string, payload: Record<string, string>) =>
  customerNotice(template, payload, 'sms') ?? GENERIC_WORDS;

/** Why a message was only logged: log mode, or a number outside the test list. */
const loggedNote = (channel: string, result: { readonly note?: string }) =>
  result.note ?? `Not sent: ${channel === 'sms' ? 'SMS' : 'WhatsApp'} delivery is in log mode.`;

/**
 * Sends one queued message. Final outcomes (sent, skipped, failed) are written to the
 * outbox row; temporary failures throw so Temporal retries with backoff.
 */
export function deliveryActivities({ db, sender, push, sms, language }: DeliveryDeps) {
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

  /** Why this number gets no template: the customer opted out, or the person sent STOP. */
  const optOutNote = async (phone: string) => {
    const [chat] = await db
      .select({ optedOutAt: waConversations.optedOutAt })
      .from(waConversations)
      .where(eq(waConversations.phone, phone))
      .limit(1);
    if (chat?.optedOutAt) return OPTED_OUT_NOTE;
    const [customer] = await db
      .select({ optIn: customers.whatsappOptIn })
      .from(customers)
      .where(eq(customers.phoneE164, phone))
      .limit(1);
    if (customer && !customer.optIn) return 'The customer has opted out of WhatsApp messages.';
    return null;
  };

  /** Why a message cannot go out as is, or the approved template and values it needs. */
  const prepare = async (
    row: typeof outbox.$inferSelect,
  ): Promise<
    | { readonly verdict: 'skipped' | 'failed'; readonly note: string }
    | {
        readonly verdict: 'send';
        readonly name: string;
        readonly language: string;
        readonly parameters: string[];
        readonly header?: TemplateHeader;
        readonly buttons?: TemplateButton[];
      }
  > => {
    if (row.channel !== 'whatsapp') {
      return { verdict: 'skipped', note: `The ${row.channel} channel is not connected yet.` };
    }
    const [config] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.key, row.template))
      .limit(1);
    const fields = config?.fields ?? MESSAGE_TEMPLATES[row.template];
    if (!fields) {
      return { verdict: 'failed', note: `No WhatsApp template is set up for "${row.template}".` };
    }
    if (config && !config.active) {
      return { verdict: 'skipped', note: 'This message is turned off in Settings.' };
    }
    const unwanted = await optOutNote(row.recipient);
    if (unwanted) return { verdict: 'skipped', note: unwanted };
    try {
      const names = { metaName: row.template, language, ...config };
      return {
        verdict: 'send',
        ...approvedMessage(
          row.template,
          fields,
          names,
          row.payload,
          config?.extrasApproved ?? false,
        ),
      };
    } catch (error) {
      if (!(error instanceof MissingFieldError)) throw error;
      return { verdict: 'failed', note: error.message };
    }
  };

  /** A message in a chat that never arrived tells the chat's people; a bad token tells admins. */
  const failWithAlerts = (id: string, reason: string, tokenInvalid = false) =>
    db.transaction(async (tx) => {
      await finish(id, 'failed', reason, null, tx);
      await tellChatSendFailed(tx, id);
      await queueFlowFallback(tx, id, reason);
      if (tokenInvalid) await alertTokenExpired(tx);
    });

  /** Meta refuses a chat message once the window closes, so retries check it again. */
  const windowOpenFor = async (phone: string) => {
    const [chat] = await db
      .select({ lastInboundAt: waConversations.lastInboundAt })
      .from(waConversations)
      .where(eq(waConversations.phone, phone))
      .limit(1);
    return chatWindowOpen(chat?.lastInboundAt);
  };

  const send = async (row: typeof outbox.$inferSelect, call: () => Promise<SendResult>) => {
    await db.update(outbox).set({ lastError: SENDING }).where(eq(outbox.id, row.id));
    try {
      const result = await call();
      if (result.outcome === 'logged') {
        await finish(row.id, 'skipped', loggedNote(row.channel, result));
        return 'skipped';
      }
      await finish(row.id, 'sent', null, result.providerId);
      if (row.channel === 'whatsapp') await logTemplateInChat(db, row).catch(() => undefined);
      return 'sent';
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof PermanentSendError) {
        // Not on WhatsApp: customer news goes by SMS (later ones SMS first); staff ones fail.
        const viaSms = row.channel === 'whatsapp' && smsCanStandIn(row.template);
        if (viaSms && isNotOnWhatsApp(error.code)) {
          await fallBackToSms(db, row.id, wordsFor);
          await finish(row.id, 'skipped', 'Not on WhatsApp: sent by SMS instead.');
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
      const [row] = await db.select().from(outbox).where(eq(outbox.id, id));
      if (row?.status !== 'pending') return 'not_pending';
      // The provider may have the message already: never send it a second time.
      if (row.lastError === SENDING) {
        await failWithAlerts(id, MAYBE_SENT);
        return 'failed';
      }
      await db
        .update(outbox)
        .set({ attempts: sql`${outbox.attempts} + 1`, startedAt: new Date() })
        .where(eq(outbox.id, id));
      if (row.channel === 'push') {
        const outcome = await deliverPush(db, push, row.recipient);
        await finish(id, outcome.status, outcome.note);
        return outcome.status;
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
        if (!(await windowOpenFor(row.recipient))) {
          await failWithAlerts(id, CHAT_WINDOW_CLOSED);
          return 'failed';
        }
        return send(row, () => sender.sendSession(row.recipient, row.payload as SessionMessage));
      }
      const prepared = await prepare(row);
      if (prepared.verdict !== 'send') {
        await finish(id, prepared.verdict, prepared.note);
        return prepared.verdict;
      }
      const { name, parameters, header, buttons } = prepared;
      return send(row, () =>
        sender.send({
          toE164: row.recipient,
          template: name,
          language: prepared.language,
          parameters,
          ...(header && { header }),
          ...(buttons && { buttons }),
        }),
      );
    },

    /** Called once retries run out, so the failure is visible to the office. */
    markOutboxFailed: (id: string, reason: string) => failPendingDelivery(db, id, reason),
  };
}
