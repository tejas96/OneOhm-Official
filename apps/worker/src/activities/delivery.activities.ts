import {
  customerNotice,
  customers,
  type Database,
  fallBackToSms,
  GENERIC_WORDS,
  messageTemplates,
  outbox,
} from '@oneohm/database';
import { isNotOnWhatsApp } from '@oneohm/domain';
import { eq, sql } from 'drizzle-orm';
import type { PushSender } from '../channels/expo-push';
import {
  approvedMessage,
  MESSAGE_TEMPLATES,
  MissingFieldError,
} from '../channels/message-templates';
import type { SmsSender } from '../channels/sms';
import {
  PermanentSendError,
  type SendResult,
  type SessionMessage,
  type WhatsAppSender,
} from '../channels/whatsapp-cloud';
import { deliverPush } from './push-delivery';

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
  ) => {
    await db
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
    const [customer] = await db
      .select({ optIn: customers.whatsappOptIn })
      .from(customers)
      .where(eq(customers.phoneE164, row.recipient))
      .limit(1);
    if (customer && !customer.optIn) {
      return { verdict: 'skipped', note: 'The customer has opted out of WhatsApp messages.' };
    }
    try {
      const names = { metaName: row.template, language, ...config };
      return { verdict: 'send', ...approvedMessage(row.template, fields, names, row.payload) };
    } catch (error) {
      if (!(error instanceof MissingFieldError)) throw error;
      return { verdict: 'failed', note: error.message };
    }
  };

  const send = async (row: typeof outbox.$inferSelect, call: () => Promise<SendResult>) => {
    try {
      const result = await call();
      if (result.outcome === 'logged') {
        const channel = row.channel === 'sms' ? 'SMS' : 'WhatsApp';
        await finish(row.id, 'skipped', `Not sent: ${channel} delivery is in log mode.`);
        return 'skipped';
      }
      await finish(row.id, 'sent', null, result.providerId);
      return 'sent';
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof PermanentSendError) {
        // Not on WhatsApp: the same news goes by SMS, and later messages go by SMS first.
        if (row.channel === 'whatsapp' && isNotOnWhatsApp(error.code)) {
          await fallBackToSms(db, row.id, wordsFor);
          await finish(row.id, 'skipped', 'Not on WhatsApp: sent by SMS instead.');
          return 'skipped';
        }
        await finish(row.id, 'failed', reason);
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
      await db
        .update(outbox)
        .set({ attempts: sql`${outbox.attempts} + 1` })
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
      // A chat reply (the customer wrote first), so no template and no opt-in check.
      if (row.template.startsWith('session:'))
        return send(row, () => sender.sendSession(row.recipient, row.payload as SessionMessage));
      const prepared = await prepare(row);
      if (prepared.verdict !== 'send') {
        await finish(id, prepared.verdict, prepared.note);
        return prepared.verdict;
      }
      const { name, parameters } = prepared;
      return send(row, () =>
        sender.send({
          toE164: row.recipient,
          template: name,
          language: prepared.language,
          parameters,
        }),
      );
    },

    /** Called once retries run out, so the failure is visible to the office. */
    async markOutboxFailed(id: string, reason: string): Promise<void> {
      await db
        .update(outbox)
        .set({ status: 'failed', lastError: reason })
        .where(sql`${outbox.id} = ${id} and ${outbox.status} = 'pending'`);
    },
  };
}
