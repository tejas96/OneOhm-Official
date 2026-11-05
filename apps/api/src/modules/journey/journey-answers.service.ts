import { Inject, Injectable } from '@nestjs/common';
import { customerActions, customers, type Database, homeNameOf, projects } from '@oneohm/database';
import { isStepKind } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { DATABASE, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CustomerDocumentsService } from '../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../customer-portal/customer-portal.service';
import { logAction } from '../documents/customer-action-log';
import { resolvePaper } from '../send-to-customer/send-papers';
import { talkTitle } from '../whatsapp/assistant/chat-words';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { askWhat } from '../whatsapp/assistant/complaint-start';
import { HandOverService } from '../whatsapp/assistant/hand-over';
import { answererName } from '../whatsapp/chat-owner';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import { sharedFileUrl } from '../whatsapp/file-links';
import { askForStageRating } from '../workforce/rating-request';
import { markPackSent } from './journey-compose';
import { answerConfirm, type Confirmed } from './journey-confirm';
import {
  handoverPack,
  installationAsk,
  notYetReply,
  readinessAsk,
  signatureAsk,
  signedCopyAsk,
} from './journey-messages';
import { handoverPapers } from './journey-papers';
import { agree } from './journey-signature';
import { agreeTap, type JourneyTap, questionTap } from './journey-taps';
import { JOURNEY_WORDS } from './journey-words';
import { StepAnswersService } from './step-answers.service';

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
    private readonly portal: CustomerPortalService,
    private readonly documents: CustomerDocumentsService,
    private readonly steps: StepAnswersService,
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
      case 'stepOk':
        return this.steps.tapped(chat, customerId, tap.id, 'ok');
      case 'stepAlt':
        return this.steps.tapped(chat, customerId, tap.id, 'alt');
      case 'stepNow':
        return this.steps.tapped(chat, customerId, tap.id, 'now');
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
    if (kind === 'installation' && result.kind === 'yes')
      await this.rateInstallation(chat, actionId);
  }

  /** The installation is fine: now the five taps for that stage (redesign §13). */
  private async rateInstallation(chat: Conversation, actionId: string) {
    const [ask] = await this.db
      .select({ projectId: customerActions.projectId })
      .from(customerActions)
      .where(eq(customerActions.id, actionId));
    const projectId = ask?.projectId;
    if (projectId)
      await this.db.transaction((tx) =>
        askForStageRating(tx, { projectId, stage: 'installation' }, chat),
      );
  }

  /** "Something is wrong": the problem report starts on this home, for the installation. */
  private async startProblem(chat: Conversation, bad: Extract<Confirmed, { kind: 'bad' }>) {
    await sayWithTaps(this.db, chat, JOURNEY_WORDS.install.wrong(bad.home), ['menu']);
    await askWhat(this.db, chat, {
      stage: 'what',
      projectId: bad.projectId,
      topic: 'installation',
    });
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
    await markPackSent(this.db, projectId);
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
    if (action.type === 'signature') {
      // Agreed: the signed page again (a fresh copy ask if the earlier one was cancelled).
      if (action.payload.agreedAt) return this.agree(chat, customerId, action.id);
      return this.askToSign(chat, customerId, action, home);
    }
    if (action.type !== 'confirm') return this.old(chat);
    if (isStepKind(action.payload.kind)) return this.steps.show(chat, action);
    if (action.payload.answer === 'not_yet')
      return void (await queueReply(this.db, chat, notYetReply(action.id)));
    const ask = action.payload.kind === 'site_ready' ? readinessAsk : installationAsk;
    for (const reply of ask('', home, action.id).replies) await queueReply(this.db, chat, reply);
  }

  /** The paper again with its two buttons; if the file cannot be found, the buttons alone. */
  private async askToSign(
    chat: Conversation,
    customerId: string,
    action: typeof customerActions.$inferSelect,
    home: string,
  ) {
    const deps = { db: this.db, env: this.env, portal: this.portal, documents: this.documents };
    const paper = await resolvePaper(deps, { customerId }, String(action.payload.paperId)).catch(
      () => null,
    );
    if (paper) {
      const ask = signatureAsk(
        { customer: '', paper, home, link: sharedFileUrl(this.env, paper.file) },
        action.id,
      );
      for (const reply of ask.replies) await queueReply(this.db, chat, reply);
      return;
    }
    const title = String(action.payload.paperTitle ?? action.title);
    await queueReply(this.db, chat, {
      kind: 'buttons',
      body: JOURNEY_WORDS.sign.ask(title, home),
      buttons: [
        { id: agreeTap(action.id), title: JOURNEY_WORDS.buttons.agree },
        { id: questionTap(action.id), title: JOURNEY_WORDS.buttons.question },
      ],
    });
  }
}
