import { Inject, Injectable } from '@nestjs/common';
import { alertVisitOwner, customerActions, readBusinessSetting } from '@oneohm/database';
import { nextActionStatus, slotLabel, type VisitSlot } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { loadCalendar } from '../../common/calendar';
import { AppError } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import type { Built } from '../send-to-customer/send-messages';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { answererName } from '../whatsapp/chat-owner';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import { tellBooked } from './visit-booked';
import type { VisitRow } from './visit-effects';
import { dayWords, pickList, proposedThanks, timeList } from './visit-messages';
import {
  openVisitFor,
  scopeOfRow,
  targetOf,
  type VisitScope,
  type VisitTarget,
} from './visit-reads';
import { saveVisit } from './visit-store';
import { daysFor, timesFor } from './visit-times';
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

  /** The business calendar and the visit settings, as saved in Settings. */
  private async rules() {
    const [cal, settings] = await Promise.all([
      loadCalendar(this.db, this.env.BUSINESS_TIMEZONE),
      readBusinessSetting(this.db, 'visits'),
    ]);
    return { cal, settings };
  }

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
    const days = await daysFor(this.db, {
      crew: target.crew,
      who: 'customer',
      timeZone: this.env.BUSINESS_TIMEZONE,
    });
    if (days.length === 0) {
      const { settings } = await this.rules();
      await queueReply(this.db, chat, { kind: 'text', body: VISIT_WORDS.pick.none(name) });
      await alertVisitOwner(this.db, this.shape(action, target), {
        kind: 'visit_no_free_day',
        title: `No free day to offer ${target.customerName}`,
        body: `${target.title}: the crew has no free day in the next ${settings.daysAhead} days. Please call the customer.`,
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

  /** The day tapped: its free times as a list, else "just taken" and the days again. */
  async day(chat: Conversation, customerId: string, actionId: string, day: string) {
    const action = await this.openAction(customerId, actionId);
    if (!action) return this.old(chat);
    const target = await targetOf(this.db, scopeOfAction(action));
    const times = await this.timesOn(target, day);
    if (times.length === 0) {
      await queueReply(this.db, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
      return this.list(chat, action, target, false);
    }
    await this.say(chat, timeList(action.id, day, times));
  }

  private timesOn(target: VisitTarget, day: string) {
    return timesFor(this.db, day, {
      crew: target.crew,
      who: 'customer',
      timeZone: this.env.BUSINESS_TIMEZONE,
    });
  }

  /**
   * The time tapped: booked at once (Settings → Visits & bookings "book customer picks at once"),
   * else proposed for the team to confirm. The time is checked again under the lock when saved.
   */
  async slot(
    chat: Conversation,
    customerId: string,
    actionId: string,
    day: string,
    pick: { readonly slot?: VisitSlot; readonly startMin?: number },
  ) {
    const action = await this.openAction(customerId, actionId);
    const next = action && nextActionStatus('visit_pick', action.status, 'customer_did_it');
    if (!action || !next) return this.old(chat);
    const target = await targetOf(this.db, scopeOfAction(action));
    const { settings } = await this.rules();
    const times = await this.timesOn(target, day);
    const time =
      pick.startMin !== undefined
        ? times.find((one) => one.startMin === pick.startMin)
        : times.find((one) => (one.startMin < 720 ? 'morning' : 'afternoon') === pick.slot);
    if (!time) {
      await queueReply(this.db, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
      return this.list(chat, action, target, false);
    }
    const booked = settings.autoConfirmCustomerPicks;
    const when = `${dayWords(day)}, ${slotLabel(time.startMin, time.endMin)}`;
    const now = new Date();
    let row: VisitRow | null;
    try {
      row = await this.db.transaction(async (tx) => {
        // Only the first answer to an ask counts, however many taps arrive at once.
        const [claimed] = await tx
          .update(customerActions)
          .set({
            status: next,
            doneAt: now,
            updatedAt: now,
            payload: { ...action.payload, day, startMin: time.startMin },
          })
          .where(and(eq(customerActions.id, action.id), eq(customerActions.status, 'open')))
          .returning({ id: customerActions.id });
        if (!claimed) return null;
        const existing = await openVisitFor(tx, target);
        const { row, moved } = await saveVisit(
          tx,
          target,
          {
            day,
            slot: time.startMin < 720 ? 'morning' : 'afternoon',
            startMin: time.startMin,
            status: booked ? 'confirmed' : 'proposed',
            by: 'customer',
            userId: null,
          },
          existing,
          now,
          this.env.BUSINESS_TIMEZONE,
        );
        await tx
          .update(customerActions)
          .set({ payload: { ...action.payload, visitId: row.id, day, startMin: time.startMin } })
          .where(eq(customerActions.id, action.id));
        await alertVisitOwner(tx, row, {
          kind: booked ? 'visit_booked' : 'visit_proposed',
          title: `${target.customerName} ${booked ? 'booked' : 'picked'} ${when}`,
          body: booked
            ? `${target.title}: booked by the customer on WhatsApp.`
            : `${target.title}: confirm the time or change it.`,
          key: `visit_${booked ? 'booked' : 'proposed'}:${row.id}:${day}:${time.startMin}`,
        });
        if (booked) await tellBooked(tx, target, row, moved, null);
        return row;
      });
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'slot_taken') throw error;
      // Someone took the time between the list and the tap.
      await queueReply(this.db, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
      return this.list(chat, action, target, false);
    }
    if (!row) return this.old(chat);
    if (booked) return;
    await sayWithTaps(
      this.db,
      chat,
      proposedThanks(now, (await this.rules()).cal),
      ['menu'],
      `visit_thanks:${row.id}:${day}:${time.startMin}`,
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
