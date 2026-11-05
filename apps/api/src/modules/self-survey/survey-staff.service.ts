import { Inject, Injectable } from '@nestjs/common';
import type { SelfSurveyView } from '@oneohm/api-contracts';
import {
  customerActions,
  customers,
  type Database,
  homeNameOf,
  queueCustomerMessage,
} from '@oneohm/database';
import { nextActionStatus, type SurveyItem, visitKindOfTask } from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE } from '../../config/core.module';
import { logAction } from '../documents/customer-action-log';
import { languageOfPhone } from '../documents/document-request-messages';
import { chatOpenFor } from '../send-to-customer/send-context';
import { workWords } from '../visits/visit-words';
import { inLanguage } from '../whatsapp/assistant/language';
import { conversationForPhone } from '../whatsapp/chat-store';
import { cancelForVisit } from './survey-answers';
import { SurveyChatService } from './survey-chat.service';
import { lastSurveyOf, type SurveyAction, updateSurvey } from './survey-record';
import { startTap } from './survey-taps';
import { viewOf } from './survey-view';

/** The engineer's choices on a survey waiting for the check (redesign §7): ask again, or a visit instead. */
@Injectable()
export class SurveyStaffService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly chat: SurveyChatService,
  ) {}

  async of(actor: Actor, taskId: string): Promise<SelfSurveyView | null> {
    assertCan(actor, 'projects.manage', 'tasks.assign');
    const ask = await lastSurveyOf(this.db, taskId);
    return ask && ask.status !== 'cancelled' ? viewOf(this.db, ask) : null;
  }

  private async waiting(actor: Actor, id: string): Promise<SurveyAction> {
    assertCan(actor, 'projects.manage', 'tasks.assign');
    const [ask] = await this.db
      .select()
      .from(customerActions)
      .where(and(eq(customerActions.id, id), eq(customerActions.type, 'self_survey')));
    if (!ask) throw notFound('That survey');
    if (ask.status !== 'received')
      throw conflict('This survey is not waiting for a check.', 'not_waiting');
    return ask;
  }

  private async customer(ask: SurveyAction) {
    const [row] = await this.db
      .select({ phone: customers.phoneE164, name: customers.name })
      .from(customers)
      .where(eq(customers.id, ask.customerId));
    if (!row) throw notFound('That customer');
    return row;
  }

  /** Only these items are asked again: in the chat, or (window closed) by the reminder template. */
  async askAgain(actor: Actor, id: string, items: readonly SurveyItem[]): Promise<SelfSurveyView> {
    const ask = await this.waiting(actor, id);
    const status = nextActionStatus('self_survey', ask.status, 'ask_again');
    if (!status) throw conflict('This survey cannot be asked again.', 'not_waiting');
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const [moved] = await tx
        .update(customerActions)
        .set({ status, doneAt: null, updatedAt: now })
        .where(and(eq(customerActions.id, id), eq(customerActions.status, 'received')))
        .returning();
      if (!moved) throw conflict('This survey was just checked.', 'not_waiting');
      await updateSurvey(tx, id, (now) => ({
        askAgain: [...new Set([...now.askAgain, ...items])],
        sentAt: null,
        awaiting: null,
      }));
      await logAction(
        tx,
        { projectId: ask.projectId, leadId: null },
        {
          kind: 'customer_action',
          message: `Asked the customer for ${items.join(', ')} again (self survey)`,
          userId: actor.userId,
          data: { customerActionId: id, items },
        },
      );
      await recordAudit(
        tx,
        actor.userId,
        'customer_action.self_survey_ask_again',
        'customer_action',
        id,
        { items },
      );
    });
    const person = await this.customer(ask);
    if (await chatOpenFor(this.db, person.phone)) {
      const chat = await conversationForPhone(this.db, person.phone);
      await inLanguage(await languageOfPhone(this.db, person.phone), () =>
        this.chat.askAgain(chat, id, items),
      );
    } else {
      await queueCustomerMessage(
        this.db,
        person.phone,
        'self_survey_reminder',
        {
          customer: titleCaseName(person.name.split(/\s+/)[0] ?? person.name),
          home: await homeNameOf(this.db, ask.projectId),
          continuePayload: startTap(id),
        },
        `self_survey_again:${id}:${now.getTime()}`,
      );
    }
    const [fresh] = await this.db.select().from(customerActions).where(eq(customerActions.id, id));
    return viewOf(this.db, fresh ?? { ...ask, status });
  }

  /** Turns the survey into a visit pick: no discount; the customer is sent the days (or the template). */
  async visitInstead(actor: Actor, id: string): Promise<SelfSurveyView> {
    const ask = await this.waiting(actor, id);
    const task = await this.db.transaction((tx) =>
      cancelForVisit(tx, ask, { userId: actor.userId, by: 'team' }),
    );
    if (!task || !visitKindOfTask(task.templateKey))
      throw conflict('No visit can be booked for this step.', 'no_visit');
    const person = await this.customer(ask);
    const language = await languageOfPhone(this.db, person.phone);
    if (await chatOpenFor(this.db, person.phone)) {
      const chat = await conversationForPhone(this.db, person.phone);
      await inLanguage(language, () => this.chat.sendDays(chat, ask.customerId, task));
    } else {
      const { pick, target } = await this.chat.pickFor(ask.customerId, task);
      await queueCustomerMessage(
        this.db,
        person.phone,
        'visit_pick',
        {
          customer: titleCaseName(person.name.split(/\s+/)[0] ?? person.name),
          home: target.home,
          work: await inLanguage(language, async () => workWords(target.kind)),
          pickPayload: `vask:${pick?.id}`,
        },
        `self_survey_visit:${id}`,
      );
    }
    const [fresh] = await this.db.select().from(customerActions).where(eq(customerActions.id, id));
    return viewOf(this.db, fresh ?? ask);
  }
}
