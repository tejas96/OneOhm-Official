import { Inject, Injectable } from '@nestjs/common';
import type { Delivery } from '@oneohm/api-contracts';
import {
  customerNotice,
  fallBackToSms,
  GENERIC_WORDS,
  outbox,
  tellChatFileFailed,
} from '@oneohm/database';
import { isNotOnWhatsApp } from '@oneohm/domain';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { deliveryState, laterStatus } from './delivery-state';
import type { DeliveryUpdate } from './whatsapp-events';

/** Every business message and its receipts (PRD 6.2); failed ones can be sent again. */
@Injectable()
export class DeliveriesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(state?: Delivery['state']): Promise<Delivery[]> {
    const rows = await this.db
      .select()
      .from(outbox)
      .orderBy(desc(outbox.createdAt))
      .limit(state ? 1000 : 200);
    return rows
      .map((row) => ({
        id: row.id,
        channel: row.channel,
        recipient: row.recipient,
        template: row.template,
        state: deliveryState(row),
        attempts: row.attempts,
        lastError: row.lastError,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
        readAt: row.readAt?.toISOString() ?? null,
      }))
      .filter((row) => !state || row.state === state)
      .slice(0, 200);
  }

  /** Puts a failed or skipped message back in the queue; the worker picks it up. */
  async retry(id: string): Promise<Delivery> {
    const [row] = await this.db
      .update(outbox)
      .set({ status: 'pending', attempts: 0, lastError: null, deliveryStatus: null })
      .where(and(eq(outbox.id, id), inArray(outbox.status, ['failed', 'skipped'])))
      .returning({ id: outbox.id });
    if (!row) throw conflict('Only failed or skipped messages can be sent again.', 'not_failed');
    const [delivery] = (await this.list()).filter((item) => item.id === id);
    if (!delivery) throw notFound('That message');
    return delivery;
  }

  /** Applies WhatsApp's sent / delivered / read / failed receipts to the outbox. */
  async applyUpdates(updates: readonly DeliveryUpdate[]): Promise<number> {
    let applied = 0;
    for (const update of updates) {
      const [row] = await this.db
        .select({ id: outbox.id, deliveryStatus: outbox.deliveryStatus })
        .from(outbox)
        .where(eq(outbox.providerMessageId, update.providerMessageId))
        .limit(1);
      if (!row || !laterStatus(row.deliveryStatus, update.status)) continue;
      await this.db.transaction(async (tx) => {
        await tx
          .update(outbox)
          .set({
            deliveryStatus: update.status,
            ...(update.status === 'delivered' ? { deliveredAt: update.at } : {}),
            // A read message was delivered too, even if that receipt never came.
            ...(update.status === 'read'
              ? {
                  readAt: update.at,
                  deliveredAt: sql`coalesce(${outbox.deliveredAt}, ${update.at})`,
                }
              : {}),
            ...(update.status === 'failed'
              ? {
                  status: 'failed' as const,
                  lastError: update.error ?? 'WhatsApp could not deliver it.',
                }
              : {}),
          })
          .where(eq(outbox.id, row.id));
        // A chat file WhatsApp could not deliver: the chat's people are told to send it again.
        if (update.status === 'failed') await tellChatFileFailed(tx, row.id);
      });
      // Not on WhatsApp: the same news goes by SMS, and later messages go by SMS first.
      if (update.status === 'failed' && isNotOnWhatsApp(update.errorCode)) {
        await fallBackToSms(
          this.db,
          row.id,
          (template, payload) => customerNotice(template, payload, 'sms') ?? GENERIC_WORDS,
        );
      }
      applied += 1;
    }
    return applied;
  }
}
