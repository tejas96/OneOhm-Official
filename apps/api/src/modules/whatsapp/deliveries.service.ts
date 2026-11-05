import { Inject, Injectable } from '@nestjs/common';
import {
  DELIVERY_LIST_LIMIT,
  type Delivery,
  type DeliveryPage,
  type DeliveryPageQuery,
} from '@oneohm/api-contracts';
import {
  customerNotice,
  fallBackToSms,
  GENERIC_WORDS,
  outbox,
  tellChatSendFailed,
} from '@oneohm/database';
import { isNotOnWhatsApp, smsCanStandIn } from '@oneohm/domain';
import { and, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { offsetOf, pageFrom } from '../../common/paging';
import { DATABASE, type Database } from '../../config/core.module';
import { deliverySearch, deliveryStateWhere } from './delivery-filter';
import { deliveryState, laterStatus } from './delivery-state';
import type { DeliveryUpdate } from './whatsapp-events';

/** Every business message and its receipts (PRD 6.2); failed ones can be sent again. */
@Injectable()
export class DeliveriesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The newest messages, filtered by state and search in the database. */
  list(state?: Delivery['state'], q?: string): Promise<Delivery[]> {
    return this.read(and(deliveryStateWhere(state), deliverySearch(q)), DELIVERY_LIST_LIMIT);
  }

  /** One page of the log, newest first, with how many match in all. */
  async page(query: DeliveryPageQuery): Promise<DeliveryPage> {
    const where = and(deliveryStateWhere(query.state), deliverySearch(query.q));
    const offset = offsetOf(query);
    const [items, [counted]] = await Promise.all([
      this.read(where, query.limit, offset),
      this.db.select({ total: count() }).from(outbox).where(where),
    ]);
    return pageFrom(items, counted?.total ?? 0, offset, query.limit);
  }

  private async read(where: SQL | undefined, limit: number, offset = 0): Promise<Delivery[]> {
    const rows = await this.db
      .select()
      .from(outbox)
      .where(where)
      .orderBy(desc(outbox.createdAt), desc(outbox.id))
      .limit(limit)
      .offset(offset);
    return rows.map((row) => ({
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
    }));
  }

  /** Puts a failed or skipped message back in the queue; the worker picks it up. */
  async retry(id: string): Promise<Delivery> {
    const [row] = await this.db
      .update(outbox)
      .set({ status: 'pending', attempts: 0, lastError: null, deliveryStatus: null })
      .where(and(eq(outbox.id, id), inArray(outbox.status, ['failed', 'skipped'])))
      .returning({ id: outbox.id });
    if (!row) throw conflict('Only failed or skipped messages can be sent again.', 'not_failed');
    // Read by id: a retried message can be older than the newest page.
    const [delivery] = await this.read(eq(outbox.id, id), 1);
    if (!delivery) throw notFound('That message');
    return delivery;
  }

  /** Applies WhatsApp's sent / delivered / read / failed receipts to the outbox. */
  async applyUpdates(updates: readonly DeliveryUpdate[]): Promise<number> {
    let applied = 0;
    for (const update of updates) {
      const [row] = await this.db
        .select({ id: outbox.id, deliveryStatus: outbox.deliveryStatus, template: outbox.template })
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
        // A message WhatsApp could not deliver tells the chat's people; a number not on
        // WhatsApp gets the same news by SMS instead, so nobody is bothered.
        if (update.status === 'failed' && !isNotOnWhatsApp(update.errorCode))
          await tellChatSendFailed(tx, row.id);
      });
      // Not on WhatsApp: the same news goes by SMS, and later messages go by SMS first.
      if (update.status === 'failed' && isNotOnWhatsApp(update.errorCode)) {
        await fallBackToSms(
          this.db,
          row.id,
          (template, payload) => customerNotice(template, payload, 'sms') ?? GENERIC_WORDS,
        );
        // A staff message has no SMS to stand in: its people hear it failed, like any other failure.
        if (!smsCanStandIn(row.template)) await tellChatSendFailed(this.db, row.id);
      }
      applied += 1;
    }
    return applied;
  }
}
