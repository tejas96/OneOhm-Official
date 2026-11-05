import { Inject, Injectable } from '@nestjs/common';
import { customerActions, type Database } from '@oneohm/database';
import { isSurveyItem, SURVEY_PHOTOS, type SurveyItem, type SurveyPhoto } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../../config/core.module';
import { type JourneyTask, taskFor } from '../journey/journey-store';
import { openActionFor } from '../send-to-customer/send-actions';
import { targetKey } from '../visits/visit-ask';
import { VisitPickService } from '../visits/visit-pick.service';
import { targetOf } from '../visits/visit-reads';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { type Conversation, chatDocumentFor, queueReply } from '../whatsapp/chat-store';
import { FormFileKeeper, showFormFiles } from '../whatsapp/forms/form-files';
import type { IncomingForm } from '../whatsapp/forms/form-reply-data';
import { FormSendService } from '../whatsapp/forms/form-send';
import type { Incoming, IncomingMedia } from '../whatsapp/whatsapp-events';
import {
  awaitingOf,
  awaitingSurvey,
  cancelForVisit,
  refusalWords,
  saveChoice,
  saveConsumer,
  savePhoto,
  startFromHome,
  waitFor,
} from './survey-answers';
import { surveyFormStart } from './survey-form-words';
import { askLocationAfter } from './survey-location';
import { questionReply } from './survey-messages';
import {
  homeOfProject,
  payloadOf,
  type SurveyAction,
  surveyById,
  updateSurvey,
} from './survey-record';
import { missingOf, sendSurvey } from './survey-submit';
import { readSurveyTap, type SurveyTap } from './survey-taps';
import { SURVEY_WORDS } from './survey-words';

const PHOTO_ITEMS: readonly string[] = SURVEY_PHOTOS;

/**
 * What the customer's taps, photos and typed words do in the self survey (redesign §7): the form when it is
 * published, else one question at a time in the chat (a list for a choice, "send the photo here" for a photo),
 * then the survey is sent and waits for the engineer. "Book a visit instead" turns it into a visit pick.
 */
@Injectable()
export class SurveyChatService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly forms: FormSendService,
    private readonly picks: VisitPickService,
    private readonly files: FormFileKeeper,
  ) {}

  async tapped(chat: Conversation, customerId: string, tap: SurveyTap): Promise<void> {
    if (tap.t === 'new' || tap.t === 'vnew') return this.fromHome(chat, customerId, tap);
    const ask = await surveyById(this.db, customerId, tap.id);
    if (!ask)
      return void (await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.old }));
    if (tap.t === 'go') return this.start(chat, customerId, ask);
    if (tap.t === 'visit') return this.visit(chat, customerId, ask);
    if (await this.db.transaction((tx) => saveChoice(tx, ask.id, tap.question, tap.value)))
      return this.next(chat, ask.id);
    return void (await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.old }));
  }

  private async fromHome(
    chat: Conversation,
    customerId: string,
    tap: SurveyTap & { t: 'new' | 'vnew' },
  ) {
    if (tap.t === 'vnew') return this.visit(chat, customerId, null, tap.id);
    const ask = await this.db.transaction((tx) => startFromHome(tx, customerId, tap.id));
    if (!ask)
      return void (await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.old }));
    return this.start(chat, customerId, ask);
  }

  /** [Start survey] / [Finish survey]: the form for a fresh survey, the chat for the rest. */
  async start(chat: Conversation, customerId: string, ask: SurveyAction): Promise<void> {
    const fresh = !payloadOf(ask).startedAt;
    const home = ask.projectId ? await homeOfProject(this.db, ask.projectId) : null;
    if (fresh && (await this.forms.available('self_survey'))) {
      await updateSurvey(this.db, ask.id, (now) => ({
        startedAt: now.startedAt ?? new Date().toISOString(),
      }));
      const start = surveyFormStart(!home?.consumerNumber, { actionId: ask.id });
      await this.forms.sendForm(chat, customerId, 'self_survey', start, SURVEY_WORDS.homeFinish);
      return;
    }
    await updateSurvey(this.db, ask.id, (now) => ({
      startedAt: now.startedAt ?? new Date().toISOString(),
    }));
    if (fresh) await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.chatIntro });
    await this.next(chat, ask.id);
  }

  /** The next thing to ask in the chat, or the survey is sent when nothing is missing. */
  async next(chat: Conversation, id: string, lead?: string): Promise<void> {
    const [ask] = await this.db.select().from(customerActions).where(eq(customerActions.id, id));
    if (ask?.status !== 'open') return;
    const [item] = await missingOf(this.db, ask);
    if (lead) await queueReply(this.db, chat, { kind: 'text', body: lead });
    if (!item) return this.finish(chat, ask);
    await waitFor(this.db, id, item === 'consumer' || PHOTO_ITEMS.includes(item) ? item : null);
    await queueReply(this.db, chat, questionReply(id, item));
  }

  private async finish(chat: Conversation, ask: SurveyAction): Promise<void> {
    const done = await this.db.transaction((tx) => sendSurvey(tx, ask));
    if (!done.sent) return this.next(chat, ask.id);
    await sayWithTaps(this.db, chat, SURVEY_WORDS.sent, ['menu']);
    const task = ask.taskId ? await taskFor(this.db, ask.taskId) : null;
    if (task) await this.db.transaction((tx) => askLocationAfter(tx, task));
  }

  /**
   * The survey form came back: the answers and each photo (checked and stored once like any chat file) are
   * saved; what is missing or refused is asked in the chat, one at a time; a complete survey is sent.
   */
  async fromForm(chat: Conversation, customerId: string, id: string, form: IncomingForm) {
    const ask = await surveyById(this.db, customerId, id);
    if (!ask)
      return void (await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.old }));
    const kept: { id: string; media: string; item: SurveyPhoto }[] = [];
    const refused = new Set<string>();
    for (const [item, file] of Object.entries(form.named)) {
      const got = await this.files.keep(chat, customerId, file);
      if (got.ok && got.contentType.startsWith('image/'))
        kept.push({ id: got.id, media: got.media, item: item as SurveyPhoto });
      else refused.add(got.ok ? SURVEY_WORDS.notPhoto : refusalWords(got.why));
    }
    await this.db.transaction(async (tx) => {
      for (const [question, value] of Object.entries(form.answers))
        if (question === 'consumer') await saveConsumer(tx, ask.id, value);
        else await saveChoice(tx, ask.id, question, value);
      for (const one of kept) await savePhoto(tx, ask.id, one.item, one.id);
      await showFormFiles(tx, chat.id, kept);
    });
    for (const body of refused) await queueReply(this.db, chat, { kind: 'text', body });
    await this.next(chat, ask.id);
  }

  /** A tap of the survey, or what the customer sent while it waits: a photo, or the consumer number as words. */
  async takeInput(chat: Conversation, customerId: string, incoming: Incoming): Promise<boolean> {
    const tap = readSurveyTap(incoming.choiceId);
    if (tap) {
      await this.tapped(chat, customerId, tap);
      return true;
    }
    if (incoming.media) return this.takeMedia(chat, customerId, incoming.media);
    return incoming.kind === 'text' && this.takeWords(chat, customerId, incoming.text);
  }

  /** A photo sent while the chat waits for one: it is that item. False when no photo is awaited. */
  async takeMedia(chat: Conversation, customerId: string, media: IncomingMedia): Promise<boolean> {
    const ask = await awaitingSurvey(this.db, customerId, true);
    const item = ask && awaitingOf(ask);
    if (!ask || !item || !isSurveyItem(item) || !PHOTO_ITEMS.includes(item)) return false;
    if (media.type !== 'image') {
      await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.notPhoto });
      return true;
    }
    const documentId = await chatDocumentFor(this.db, media.id);
    // Not stored (too big, unreadable): the usual file reply tells the customer why.
    if (!documentId) return false;
    await this.db.transaction((tx) => savePhoto(tx, ask.id, item as SurveyPhoto, documentId));
    await this.next(chat, ask.id, SURVEY_WORDS.gotPhoto);
    return true;
  }

  /** Words typed while the chat waits for the consumer number. False when none is awaited. */
  async takeWords(chat: Conversation, customerId: string, said: string): Promise<boolean> {
    const ask = await awaitingSurvey(this.db, customerId, false);
    if (!ask) return false;
    if ((await this.db.transaction((tx) => saveConsumer(tx, ask.id, said))) === 'bad') {
      await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.badNumber });
      return true;
    }
    await this.next(chat, ask.id);
    return true;
  }

  /** Asked again by the engineer: only these items are asked, in the chat, one at a time. */
  async askAgain(chat: Conversation, id: string, items: readonly SurveyItem[]): Promise<void> {
    await updateSurvey(this.db, id, (now) => ({
      askAgain: [...new Set([...now.askAgain, ...items])],
    }));
    const [ask] = await this.db.select().from(customerActions).where(eq(customerActions.id, id));
    if (ask)
      await this.next(
        chat,
        id,
        SURVEY_WORDS.askAgain(items.map((one) => SURVEY_WORDS.what[one]).join(', ')),
      );
  }

  /** The visit pick the customer is sent to (made now, or the one already open) and its target. */
  async pickFor(customerId: string, task: JourneyTask) {
    const target = await targetOf(this.db, { taskId: task.id });
    const existing = await openActionFor(this.db, customerId, 'visit_pick', {
      target: targetKey(target),
    });
    const [pick] = existing
      ? await this.db.select().from(customerActions).where(eq(customerActions.id, existing))
      : await this.db
          .insert(customerActions)
          .values({
            type: 'visit_pick',
            customerId,
            projectId: task.projectId,
            propertyId: target.propertyId,
            taskId: task.id,
            title: `Pick a day: ${target.title} — ${target.home}`,
            payload: { visitKind: target.kind, target: targetKey(target) },
          })
          .returning();
    return { pick, target };
  }

  /** The days to pick from, in the chat. */
  async sendDays(chat: Conversation, customerId: string, task: JourneyTask): Promise<void> {
    const { pick, target } = await this.pickFor(customerId, task);
    await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.visitInstead });
    if (pick) await this.picks.list(chat, pick, target, false);
  }

  /** [Book a visit instead]: no discount, and the customer picks a day for the survey visit. */
  async visit(chat: Conversation, customerId: string, ask: SurveyAction | null, taskId?: string) {
    const task = await this.db.transaction(async (tx) =>
      ask
        ? await cancelForVisit(tx, ask, { userId: null, by: 'customer' })
        : await taskFor(tx, taskId ?? ''),
    );
    if (!task)
      return void (await queueReply(this.db, chat, { kind: 'text', body: SURVEY_WORDS.old }));
    await this.sendDays(chat, customerId, task);
  }
}
