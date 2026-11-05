import { Inject, Injectable } from '@nestjs/common';
import { alertVisitOwner, customerActions, visits } from '@oneohm/database';
import { isPresenceKind, OPEN_VISIT_STATUSES } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { answererName } from '../whatsapp/chat-owner';
import { type Conversation } from '../whatsapp/chat-store';
import { targetKey } from './visit-ask';
import { logVisit, type VisitRow } from './visit-effects';
import { dayWords } from './visit-messages';
import { VisitPickService } from './visit-pick.service';
import { scopeOfRow, targetOf } from './visit-reads';
import { cancelVisit, customerConfirmed } from './visit-store';
import type { VisitTap } from './visit-taps';
import { VISIT_WORDS } from './visit-words';

/**
 * What the customer's taps on the visit messages do (redesign §8): the pick (VisitPickService),
 * [Confirm] / [I'll be there], [Okay] and [Change day].
 */
@Injectable()
export class VisitAnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly picks: VisitPickService,
  ) {}

  async tapped(chat: Conversation, customerId: string, tap: VisitTap): Promise<void> {
    switch (tap.t) {
      case 'ask':
        return this.picks.ask(chat, customerId, tap.actionId, false);
      case 'day':
        return this.picks.day(chat, customerId, tap.actionId, tap.day);
      case 'slot':
        return this.picks.slot(chat, customerId, tap.actionId, tap.day, tap.slot);
      case 'confirm':
      case 'okay':
        return this.confirm(chat, customerId, tap.visitId, tap.t === 'okay');
      case 'change':
        return this.change(chat, customerId, tap.visitId);
    }
  }

  private async visitOf(customerId: string, id: string): Promise<VisitRow | null> {
    const [row] = await this.db
      .select()
      .from(visits)
      .where(
        and(
          eq(visits.id, id),
          eq(visits.customerId, customerId),
          inArray(visits.status, [...OPEN_VISIT_STATUSES]),
        ),
      );
    return row ?? null;
  }

  /** [Confirm] / [I'll be there] / [Okay]: the customer's presence is logged. */
  private async confirm(chat: Conversation, customerId: string, visitId: string, okay: boolean) {
    const row = await this.visitOf(customerId, visitId);
    if (!row) return this.picks.old(chat);
    const target = await targetOf(this.db, scopeOfRow(row));
    if (!row.customerConfirmedAt)
      await this.db.transaction((tx) => customerConfirmed(tx, row, target.title));
    const words = VISIT_WORDS.thanks;
    await sayWithTaps(
      this.db,
      chat,
      okay ? words.okay : isPresenceKind(row.kind) ? words.there : words.confirmed,
      ['menu'],
    );
  }

  /** [Change day]: a DISCOM date alerts the person who liaises; anything else goes back to the list. */
  private async change(chat: Conversation, customerId: string, visitId: string) {
    const row = await this.visitOf(customerId, visitId);
    if (!row) return this.picks.old(chat);
    const target = await targetOf(this.db, scopeOfRow(row));
    const name = (await answererName(this.db, chat)) ?? VISIT_WORDS.pick.team;
    const when = `${dayWords(row.day)}, ${row.slot}`;
    if (isPresenceKind(row.kind)) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(visits)
          .set({ customerCannotAt: new Date(), updatedAt: new Date() })
          .where(eq(visits.id, row.id));
        await logVisit(
          tx,
          row,
          null,
          'visit.customer_cannot',
          `${target.title}: the customer cannot be at home on ${when}`,
        );
        await alertVisitOwner(tx, row, {
          kind: 'visit_customer_cannot',
          title: `${target.customerName} cannot be at home on ${dayWords(row.day)}`,
          body: `${target.title}: they asked for another day. Agree a new date with the DISCOM and tell the customer.`,
          key: `visit_cannot:${row.id}`,
        });
      });
      return void (await sayWithTaps(this.db, chat, VISIT_WORDS.thanks.cannot(name), ['menu']));
    }
    const action = await this.db.transaction(async (tx) => {
      await cancelVisit(tx, row, null, 'The customer asked for another day', target.title);
      const [fresh] = await tx
        .insert(customerActions)
        .values({
          type: 'visit_pick',
          customerId,
          projectId: row.projectId,
          leadId: row.leadId,
          propertyId: row.propertyId,
          taskId: row.taskId,
          title: `Pick a day: ${target.title} — ${target.home}`,
          payload: {
            visitKind: row.kind,
            serviceRequestId: row.serviceRequestId,
            leadId: row.leadId,
            target: targetKey(target),
          },
        })
        .returning();
      await alertVisitOwner(tx, row, {
        kind: 'visit_change_day',
        title: `${target.customerName} wants another day`,
        body: `${target.title}: they cannot make ${when}. They are picking a new day.`,
        key: `visit_change:${row.id}`,
      });
      return fresh;
    });
    if (action) await this.picks.list(chat, action, target, true);
  }
}
