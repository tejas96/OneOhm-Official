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
import { customerActions } from '@oneohm/database';
import type { SendAction } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
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
      const actionId = await this.record(tx, ctx, actor.userId, composed);
      // The same ask is one message; a re-sent reminder of an open ask gets its own key.
      const key = `send:${body.request.action}:${actionId ?? id}:${id}`;
      const via = await deliver(tx, ctx, composed.built, key, actor.userId);
      return { via, actionId };
    });
  }

  private async context(actor: Actor, body: SendBody): Promise<SendContext> {
    const ctx = await resolveScope(this.db, actor, body.scope);
    if (isNone(ctx)) throw conflict(ctx.reason, 'no_customer');
    return ctx;
  }

  private async record(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
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
    if (existing && record.type === 'location') {
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
