import { customers, type Database, outbox } from '@oneohm/database';
import { eq, sql } from 'drizzle-orm';
import type { PushSender } from '../channels/expo-push';
import { isMessageKey, MissingFieldError, templateParameters } from '../channels/message-templates';
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
  readonly language: string;
}

/**
 * Sends one queued message. Final outcomes (sent, skipped, failed) are written to the
 * outbox row; temporary failures throw so Temporal retries with backoff.
 */
export function deliveryActivities({ db, sender, push, language }: DeliveryDeps) {
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

  /** Why a message cannot go out as is, or the template values it needs. */
  const prepare = async (
    row: typeof outbox.$inferSelect,
  ): Promise<
    | { readonly verdict: 'skipped' | 'failed'; readonly note: string }
    | { readonly verdict: 'send'; readonly parameters: string[] }
  > => {
    if (row.channel !== 'whatsapp') {
      return { verdict: 'skipped', note: `The ${row.channel} channel is not connected yet.` };
    }
    if (!isMessageKey(row.template)) {
      return { verdict: 'failed', note: `No WhatsApp template is set up for "${row.template}".` };
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
      return {
        verdict: 'send',
        parameters: templateParameters(row.template, row.payload as Record<string, unknown>),
      };
    } catch (error) {
      if (!(error instanceof MissingFieldError)) throw error;
      return { verdict: 'failed', note: error.message };
    }
  };

  const send = async (row: typeof outbox.$inferSelect, call: () => Promise<SendResult>) => {
    try {
      const result = await call();
      if (result.outcome === 'logged') {
        await finish(row.id, 'skipped', 'Not sent: WhatsApp delivery is in log mode.');
        return 'skipped';
      }
      await finish(row.id, 'sent', null, result.providerId);
      return 'sent';
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof PermanentSendError) {
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
      // A chat reply (the customer wrote first), so no template and no opt-in check.
      if (row.template.startsWith('session:'))
        return send(row, () => sender.sendSession(row.recipient, row.payload as SessionMessage));
      const prepared = await prepare(row);
      if (prepared.verdict !== 'send') {
        await finish(id, prepared.verdict, prepared.note);
        return prepared.verdict;
      }
      const parameters = prepared.parameters;
      return send(row, () =>
        sender.send({ toE164: row.recipient, template: row.template, language, parameters }),
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
