import { Inject, Injectable } from '@nestjs/common';
import { customerActions, customers, type Database, homeNameOf, projects } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { DATABASE, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { logAction } from '../documents/customer-action-log';
import { setStep } from '../whatsapp/assistant/chat-step';
import { talkTitle } from '../whatsapp/assistant/chat-words';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { HandOverService } from '../whatsapp/assistant/hand-over';
import { keepPending } from '../whatsapp/assistant/media-intake';
import { answererName } from '../whatsapp/chat-owner';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import { answerConfirm, type Confirmed } from './journey-confirm';
import {
  handoverPack,
  installationAsk,
  notYetReply,
  readinessAsk,
  signedCopyAsk,
} from './journey-messages';
import { handoverPapers } from './journey-papers';
import { agree } from './journey-signature';
import type { JourneyTap } from './journey-taps';
import { JOURNEY_WORDS } from './journey-words';

/**
 * What the customer's taps on the journey messages do (redesign §4, §18): [I agree] and
 * [I have a question] on a paper to sign, the roof and installation answers, the handover pack from
 * the closed-window template, and a waiting message's link back to the open question.
 */
@Injectable()
export class JourneyAnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly people: HandOverService,
  ) {}

  async tapped(chat: Conversation, customerId: string, tap: JourneyTap): Promise<void> {
    switch (tap.t) {
      case 'agree':
        return this.agree(chat, customerId, tap.id);
      case 'question':
        return this.question(chat, customerId, tap.id);
      case 'ready':
        return this.confirm(chat, customerId, tap.id, 'site_ready', 'yes');
      case 'notYet':
        return this.confirm(chat, customerId, tap.id, 'site_ready', 'not_yet');
      case 'readyNow':
        return this.confirm(chat, customerId, tap.id, 'site_ready', 'now');
      case 'installOk':
        return this.confirm(chat, customerId, tap.id, 'installation', 'yes');
      case 'installBad':
        return this.confirm(chat, customerId, tap.id, 'installation', 'bad');
      case 'pack':
        return this.pack(chat, customerId, tap.id);
      case 'show':
        return this.show(chat, customerId, tap.id);
    }
  }

  private old(chat: Conversation) {
    return queueReply(this.db, chat, { kind: 'text', body: JOURNEY_WORDS.old });
  }

  private async agree(chat: Conversation, customerId: string, actionId: string) {
    const result = await agree(this.db, chat, customerId, actionId);
    if (result.kind === 'old') return this.old(chat);
    if (result.kind === 'own') {
      const talk = { id: 'go:talk', title: talkTitle(await answererName(this.db, chat)) };
      return sayWithTaps(this.db, chat, JOURNEY_WORDS.sign.ownOnly(result.name), [talk]);
    }
    await queueReply(this.db, chat, signedCopyAsk(`sendit:${result.copyId}`));
  }

  /** [I have a question]: a person answers, and the alert names the paper. */
  private async question(chat: Conversation, customerId: string, actionId: string) {
    const [action] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'signature'),
          eq(customerActions.status, 'open'),
        ),
      );
    if (!action) return this.old(chat);
    const paper = String(action.payload.paperTitle ?? action.title);
    await this.db.transaction((tx) =>
      logAction(tx, action, {
        kind: 'customer_action',
        message: `The customer has a question about ${paper} (WhatsApp)`,
        userId: null,
        data: { customerActionId: action.id },
      }),
    );
    await this.people.passToOwner(chat, {
      summary: `Question about the ${paper} they were sent to sign.`,
    });
  }

  private async confirm(
    chat: Conversation,
    customerId: string,
    actionId: string,
    kind: 'site_ready' | 'installation',
    answer: 'yes' | 'not_yet' | 'now' | 'bad',
  ) {
    const result = await answerConfirm(this.db, customerId, actionId, kind, answer);
    const words = JOURNEY_WORDS;
    if (result.kind === 'old') return this.old(chat);
    if (result.kind === 'notYet')
      return void (await queueReply(this.db, chat, notYetReply(actionId)));
    if (result.kind === 'bad') return this.startProblem(chat, result);
    const text =
      result.kind === 'now'
        ? words.ready.now
        : kind === 'site_ready'
          ? words.ready.yes
          : words.install.yes;
    await sayWithTaps(this.db, chat, text, ['menu']);
  }

  /** "Something is wrong": the problem report starts on this home, for the installation. */
  private async startProblem(chat: Conversation, bad: Extract<Confirmed, { kind: 'bad' }>) {
    await setStep(this.db, chat, 'await_problem', {
      ...keepPending(chat.context),
      ...(bad.projectId ? { projectId: bad.projectId } : {}),
      topic: 'installation',
    });
    await sayWithTaps(this.db, chat, JOURNEY_WORDS.install.wrong(bad.home), ['menu']);
  }

  /** [Documents] on the closed-window handover template: now the chat is open, the papers go in one go. */
  private async pack(chat: Conversation, customerId: string, projectId: string) {
    const [project] = await this.db
      .select({ id: projects.id, name: customers.name })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(and(eq(projects.id, projectId), eq(projects.customerId, customerId)));
    const papers = project
      ? await handoverPapers(this.db, this.env, {
          customerId,
          customerName: project.name,
          projectId,
        })
      : [];
    if (!project || papers.length === 0)
      return sayWithTaps(this.db, chat, JOURNEY_WORDS.pack.none, ['menu']);
    const home = await homeNameOf(this.db, projectId);
    const built = handoverPack({ customer: project.name, home, projectId }, papers);
    for (const reply of built.replies) await queueReply(this.db, chat, reply);
  }

  /** The link of "We need … to continue": the open question or the signed-page ask, again. */
  private async show(chat: Conversation, customerId: string, actionId: string) {
    const [action] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.status, 'open'),
        ),
      );
    if (!action) return this.old(chat);
    const home = await homeNameOf(this.db, action.projectId);
    const copy = action.payload.signedActionId;
    if (action.type === 'signature' && typeof copy === 'string')
      return void (await queueReply(this.db, chat, signedCopyAsk(`sendit:${copy}`)));
    if (action.type === 'signature') {
      const paper = String(action.payload.paperTitle ?? action.title);
      return void (await queueReply(this.db, chat, {
        kind: 'buttons',
        body: JOURNEY_WORDS.sign.ask(paper, home),
        buttons: [
          { id: `sgn:ok:${action.id}`, title: JOURNEY_WORDS.buttons.agree },
          { id: `sgn:q:${action.id}`, title: JOURNEY_WORDS.buttons.question },
        ],
      }));
    }
    if (action.type !== 'confirm') return this.old(chat);
    if (action.payload.answer === 'not_yet')
      return void (await queueReply(this.db, chat, notYetReply(action.id)));
    const ask = action.payload.kind === 'site_ready' ? readinessAsk : installationAsk;
    for (const reply of ask('', home, action.id).replies) await queueReply(this.db, chat, reply);
  }
}
