import { Inject, Injectable } from '@nestjs/common';
import { customerActions, customers, type DatabaseExecutor } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { logAction } from '../documents/customer-action-log';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { HandOverService } from '../whatsapp/assistant/hand-over';
import type { Conversation } from '../whatsapp/chat-store';
import { AMC_WORDS } from './amc-words';
import { callPromise, callWhen } from './call-promise';
import { alertCall, openCallTask } from './call-task';
import { callerFor } from './care-person';

/**
 * The customer's answer to the AMC renewal offer (redesign §4): [Renew AMC] closes the offer, promises a
 * call and makes a call task for the person who looks after them (and tells them); [Talk to {name}] hands
 * the chat to that person. Tapping twice changes nothing more.
 */
@Injectable()
export class AmcRenewalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly people: HandOverService,
  ) {}

  async tapped(chat: Conversation, customerId: string, id: string, renew: boolean) {
    const [ask] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, id),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'confirm'),
        ),
      );
    if (!ask || ask.payload.kind !== 'amc_renewal' || ask.status !== 'open')
      return sayWithTaps(this.db, chat, AMC_WORDS.old, ['menu']);
    if (!renew) {
      await this.close(ask, 'talk');
      return this.people.passToOwner(chat);
    }
    const [customer] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId));
    const person = await callerFor(this.db, { projectId: ask.projectId, phone: chat.phone });
    const promise = callPromise(new Date(), this.env.BUSINESS_TIMEZONE);
    await this.db.transaction(async (tx) => {
      await this.close(ask, 'renew', tx);
      await openCallTask(tx, {
        customerId,
        projectId: ask.projectId,
        owner: person.id,
        title: `Call ${customer?.name ?? 'the customer'} to renew the AMC`,
        reason: 'quote',
        once: `call:amc:${ask.id}`,
        promise,
      });
      await alertCall(tx, {
        owner: person.id,
        projectId: ask.projectId,
        title: `${customer?.name ?? 'A customer'} wants to renew their AMC`,
        body: `${ask.title}. Please call them ${callWhen(promise)}.`,
        key: `amc_renew:${ask.id}`,
      });
    });
    return sayWithTaps(
      this.db,
      chat,
      AMC_WORDS.renewed(person.name ?? AMC_WORDS.team, callWhen(promise)),
      ['menu'],
    );
  }

  private async close(
    ask: typeof customerActions.$inferSelect,
    answer: 'renew' | 'talk',
    db: DatabaseExecutor = this.db,
  ) {
    const now = new Date();
    await db
      .update(customerActions)
      .set({
        status: 'closed',
        doneAt: now,
        closedAt: now,
        updatedAt: now,
        payload: { ...ask.payload, answer },
      })
      .where(and(eq(customerActions.id, ask.id), eq(customerActions.status, 'open')));
    await logAction(db, ask, {
      kind: 'customer_action',
      message: `${ask.title}: the customer ${answer === 'renew' ? 'wants to renew' : 'wants to talk'} (WhatsApp)`,
      userId: null,
      data: { customerActionId: ask.id },
    });
    await recordAudit(db, null, 'customer_action.answered', 'customer_action', ask.id, {
      answer,
    });
  }
}
