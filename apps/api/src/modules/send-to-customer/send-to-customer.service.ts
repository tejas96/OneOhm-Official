import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  SendBody,
  SendOffer,
  SendOptions,
  SendPreview,
  SendRequest,
  SendResult,
  SendScope,
} from '@oneohm/api-contracts';
import { auditLog, customerActions } from '@oneohm/database';
import type { SendAction } from '@oneohm/domain';
import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CustomerDocumentsService } from '../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../customer-portal/customer-portal.service';
import { logSend, openAction, openActionFor } from './send-actions';
import { type Composed, compose } from './send-compose';
import {
  allowedActions,
  assertAllowed,
  isNone,
  resolveScope,
  type SendContext,
} from './send-context';
import { deliver, previewOf } from './send-deliver';
import { offersFor } from './send-offers';
import type { Deps } from './send-papers';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const ACTION_OF = (request: SendRequest): SendAction => request.action;

/**
 * The staff "Send to customer" menu (redesign §18): what fits the place, a preview of exactly
 * what the customer gets (the same builder as the send), and the send. A send that asks
 * something of the customer is a customer action, shown in "Asked from the customer";
 * a document, a crew contact and a delay notice leave a log line and an audit row.
 */
@Injectable()
export class SendToCustomerService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly documents: CustomerDocumentsService,
  ) {}

  private get deps(): Deps {
    return { db: this.db, env: this.env, portal: this.portal, documents: this.documents };
  }

  async options(actor: Actor, scope: SendScope): Promise<SendOptions> {
    const ctx = await resolveScope(this.db, actor, scope);
    if (isNone(ctx)) return { customerName: '', canAskPaper: false, offers: [], empty: ctx.reason };
    const allowed = allowedActions(actor, ctx.place);
    const offers: SendOffer[] = [];
    for (const action of allowed) offers.push(...(await offersFor(this.deps, ctx, action)));
    return {
      customerName: ctx.customerName,
      canAskPaper: allowed.includes('ask_paper'),
      offers,
      empty: allowed.length === 0 ? 'You do not have a right to send anything from here.' : null,
    };
  }

  async preview(actor: Actor, body: SendBody): Promise<SendPreview> {
    const ctx = await this.context(actor, body);
    assertAllowed(actor, ctx.place, ACTION_OF(body.request));
    return previewOf(this.db, ctx, (await compose(this.deps, ctx, body.request)).built);
  }

  async send(actor: Actor, body: SendBody): Promise<SendResult> {
    const ctx = await this.context(actor, body);
    assertAllowed(actor, ctx.place, ACTION_OF(body.request));
    const id = randomUUID();
    const composed = await compose(this.deps, ctx, body.request, id);
    return this.db.transaction(async (tx) => {
      // One press of Send is one send: a double tap or a retry with the same id answers the first.
      const again = body.requestId ? await this.sentBefore(tx, body.requestId) : null;
      if (again) return again;
      const actionId = await this.record(tx, ctx, actor.userId, composed);
      // The same ask is one message; a re-sent reminder of an open ask gets its own key.
      const key = `send:${body.request.action}:${actionId ?? id}:${id}`;
      const via = await deliver(tx, ctx, composed.built, key, actor.userId);
      if (body.requestId)
        await recordAudit(
          tx,
          actor.userId,
          'customer.send_request',
          'send_request',
          body.requestId,
          {
            via,
            actionId,
          },
        );
      return { via, actionId };
    });
  }

  /** What an earlier send with this id answered; takes the lock so two at once take turns. */
  private async sentBefore(tx: Tx, requestId: string): Promise<SendResult | null> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${requestId}))`);
    const [row] = await tx
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'send_request'), eq(auditLog.entityId, requestId)))
      .limit(1);
    const data = row?.data as SendResult | null | undefined;
    return data ? { via: data.via, actionId: data.actionId ?? null } : null;
  }

  private async context(actor: Actor, body: SendBody): Promise<SendContext> {
    const ctx = await resolveScope(this.db, actor, body.scope);
    if (isNone(ctx)) throw conflict(ctx.reason, 'no_customer');
    return ctx;
  }

  private async record(
    tx: Tx,
    ctx: SendContext,
    userId: string,
    { record }: Composed,
  ): Promise<string | null> {
    if (record.kind === 'log') {
      await logSend(tx, ctx, userId, record, record.data);
      return null;
    }
    const existing = await openActionFor(tx, ctx.customerId, record.type, {
      ...(record.type === 'location' && record.propertyId ? { propertyId: record.propertyId } : {}),
      ...(record.type === 'pay' ? { milestoneId: String(record.payload.milestoneId) } : {}),
    });
    if (existing && (record.type === 'location' || record.type === 'callback')) {
      throw conflict('The customer has already been asked for this.', 'already_asked');
    }
    if (existing && record.type === 'pay') {
      await tx
        .update(customerActions)
        .set({ updatedAt: new Date() })
        .where(eq(customerActions.id, existing));
      await logSend(tx, ctx, userId, {
        audit: 'customer_action.resent',
        entity: 'customer_action',
        entityId: existing,
        log: record.log,
        projectId: record.projectId,
      });
      return existing;
    }
    return openAction(tx, ctx, userId, record);
  }
}
