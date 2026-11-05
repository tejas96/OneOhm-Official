import { Inject, Injectable } from '@nestjs/common';
import { alertVisitOwner, customerActions } from '@oneohm/database';
import { freeSlots, nextActionStatus } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import type { Built } from '../send-to-customer/send-messages';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { answererName } from '../whatsapp/chat-owner';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import { freeDaysFor, takenSlots } from './visit-capacity';
import { dayWords, pickList, proposedThanks, slotButtons } from './visit-messages';
import {
  openVisitFor,
  scopeOfRow,
  targetOf,
  type VisitScope,
  type VisitTarget,
} from './visit-reads';
import { saveVisit } from './visit-store';
import { VISIT_WORDS } from './visit-words';

type Action = typeof customerActions.$inferSelect;

const scopeOfAction = (action: Action): VisitScope => {
  const serviceRequestId = action.payload.serviceRequestId;
  return scopeOfRow({
    taskId: action.taskId,
    leadId: action.leadId,
    serviceRequestId: typeof serviceRequestId === 'string' ? serviceRequestId : null,
  });
};

/**
 * The pick (redesign §8): the list of free days, the slot buttons, and the proposed visit with the
 * waiting ask and the alert to the person who owns it.
 */
@Injectable()
export class VisitPickService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  old(chat: Conversation) {
    return queueReply(this.db, chat, { kind: 'text', body: VISIT_WORDS.old });
  }

  async say(chat: Conversation, built: Built) {
    for (const reply of built.replies) await queueReply(this.db, chat, reply);
  }

  private async openAction(customerId: string, id: string): Promise<Action | null> {
    const [action] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, id),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'visit_pick'),
          eq(customerActions.status, 'open'),
        ),
      );
    return action ?? null;
  }

  /** The list of days the crew is free, with "Talk to …" (the same list the team's ask carries). */
  async ask(chat: Conversation, customerId: string, actionId: string, again: boolean) {
    const action = await this.openAction(customerId, actionId);
    if (!action) return this.old(chat);
    const target = await targetOf(this.db, scopeOfAction(action));
    await this.list(chat, action, target, again);
  }

  async list(chat: Conversation, action: Action, target: VisitTarget, again: boolean) {
    const name = (await answererName(this.db, chat)) ?? VISIT_WORDS.pick.team;
    const days = await freeDaysFor(this.db, target.crew, 9, undefined, this.env.BUSINESS_TIMEZONE);
    if (days.length === 0) {
      await queueReply(this.db, chat, { kind: 'text', body: VISIT_WORDS.pick.none(name) });
      await alertVisitOwner(this.db, this.shape(action, target), {
        kind: 'visit_no_free_day',
        title: `No free day to offer ${target.customerName}`,
        body: `${target.title}: the crew has no free day in the next 45 days. Please call the customer.`,
        key: `visit_no_day:${action.id}`,
      });
      return;
    }
    await this.say(
      chat,
      pickList({
        actionId: action.id,
        kind: target.kind,
        home: target.home,
        days,
        name,
        again,
        customer: target.customerName,
      }),
    );
  }

  async day(chat: Conversation, customerId: string, actionId: string, day: string) {
    const action = await this.openAction(customerId, actionId);
    if (!action) return this.old(chat);
    const target = await targetOf(this.db, scopeOfAction(action));
    const taken = await takenSlots(this.db, target.crew, todayIn(this.env.BUSINESS_TIMEZONE));
    const slots = freeSlots(taken[day] ?? []);
    if (slots.length === 0 || day <= todayIn(this.env.BUSINESS_TIMEZONE)) {
      await queueReply(this.db, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
      return this.list(chat, action, target, false);
    }
    await this.say(chat, slotButtons(action.id, day, slots));
  }

  /** The pick: a proposed visit, the ask waits for the team, the owner is told. */
  async slot(
    chat: Conversation,
    customerId: string,
    actionId: string,
    day: string,
    slot: 'morning' | 'afternoon',
  ) {
    const action = await this.openAction(customerId, actionId);
    const next = action && nextActionStatus('visit_pick', action.status, 'customer_did_it');
    if (!action || !next) return this.old(chat);
    const target = await targetOf(this.db, scopeOfAction(action));
    const taken = await takenSlots(this.db, target.crew, todayIn(this.env.BUSINESS_TIMEZONE));
    if (day <= todayIn(this.env.BUSINESS_TIMEZONE) || !freeSlots(taken[day] ?? []).includes(slot)) {
      await queueReply(this.db, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
      return this.list(chat, action, target, false);
    }
    const now = new Date();
    const row = await this.db.transaction(async (tx) => {
      const { row } = await saveVisit(
        tx,
        target,
        { day, slot, status: 'proposed', by: 'customer', userId: null },
        await openVisitFor(tx, target),
        now,
      );
      await tx
        .update(customerActions)
        .set({
          status: next,
          doneAt: now,
          updatedAt: now,
          payload: { ...action.payload, visitId: row.id, day, slot },
        })
        .where(eq(customerActions.id, action.id));
      await alertVisitOwner(tx, row, {
        kind: 'visit_proposed',
        title: `${target.customerName} picked ${dayWords(day)}, ${slot}`,
        body: `${target.title}: confirm the day or change it.`,
        key: `visit_proposed:${row.id}:${day}:${slot}`,
      });
      return row;
    });
    await sayWithTaps(
      this.db,
      chat,
      proposedThanks(now, this.env.BUSINESS_TIMEZONE),
      ['menu'],
      `visit_thanks:${row.id}:${day}:${slot}`,
    );
  }

  shape(action: Action, target: VisitTarget) {
    return {
      id: action.id,
      kind: target.kind,
      taskId: target.taskId,
      projectId: target.projectId,
      leadId: target.leadId,
      serviceRequestId: target.serviceRequestId,
      crewUserIds: [...target.crew],
    };
  }
}
