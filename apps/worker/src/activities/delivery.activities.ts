import { customers, type Database, outbox } from '@oneohm/database';
import { eq, sql } from 'drizzle-orm';
import { isMessageKey, MissingFieldError, templateParameters } from '../channels/message-templates';
import { PermanentSendError, type WhatsAppSender } from '../channels/whatsapp-cloud';

export type DeliveryOutcome = 'sent' | 'skipped' | 'failed' | 'not_pending';

interface DeliveryDeps {
  readonly db: Database;
  readonly sender: WhatsAppSender;
  readonly language: string;
}

/**
 * Sends one queued message. Final outcomes (sent, skipped, failed) are written to the
 * outbox row; temporary failures throw so Temporal retries with backoff.
 */
export function deliveryActivities({ db, sender, language }: DeliveryDeps) {
  const finish = async (id: string, status: 'sent' | 'skipped' | 'failed', note: string | null) => {
    await db
      .update(outbox)
      .set({ status, lastError: note, ...(status === 'sent' ? { sentAt: new Date() } : {}) })
      .where(eq(outbox.id, id));
  };

  return {
    async deliverOutboxMessage(id: string): Promise<DeliveryOutcome> {
      const [row] = await db.select().from(outbox).where(eq(outbox.id, id));
      if (!row || row.status !== 'pending') return 'not_pending';
      await db
        .update(outbox)
        .set({ attempts: sql`${outbox.attempts} + 1` })
        .where(eq(outbox.id, id));

      if (row.channel !== 'whatsapp') {
        await finish(id, 'skipped', `The ${row.channel} channel is not connected yet.`);
        return 'skipped';
      }
      if (!isMessageKey(row.template)) {
        await finish(id, 'failed', `No WhatsApp template is set up for "${row.template}".`);
        return 'failed';
      }
      const [customer] = await db
        .select({ optIn: customers.whatsappOptIn })
        .from(customers)
        .where(eq(customers.phoneE164, row.recipient))
        .limit(1);
      if (customer && !customer.optIn) {
        await finish(id, 'skipped', 'The customer has opted out of WhatsApp messages.');
        return 'skipped';
      }

      let parameters: string[];
      try {
        parameters = templateParameters(row.template, row.payload as Record<string, unknown>);
      } catch (error) {
        if (!(error instanceof MissingFieldError)) throw error;
        await finish(id, 'failed', error.message);
        return 'failed';
      }

      try {
        const result = await sender.send({
          toE164: row.recipient,
          template: row.template,
          language,
          parameters,
        });
        if (result.outcome === 'logged') {
          await finish(id, 'skipped', 'Not sent: WhatsApp delivery is in log mode.');
          return 'skipped';
        }
        await finish(id, 'sent', result.providerId ? `message ${result.providerId}` : null);
        return 'sent';
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (error instanceof PermanentSendError) {
          await finish(id, 'failed', reason);
          return 'failed';
        }
        await db.update(outbox).set({ lastError: reason }).where(eq(outbox.id, id));
        throw error;
      }
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
