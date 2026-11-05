import { Inject, Injectable, Logger } from '@nestjs/common';
import { type DatabaseExecutor, homeNameOf } from '@oneohm/database';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { problemFormStart } from '../../care/care-form-words';
import {
  type CareTap,
  PROBLEM_KINDS,
  type ProblemKind,
  SINCE_CHOICES,
  type Since,
} from '../../care/care-taps';
import { callerOfRequest, promiseProblemCall } from '../../care/problem-call';
import { PROBLEM_LISTS, PROBLEM_WORDS } from '../../care/problem-words';
import { activeHomes } from '../../customer-portal/active-projects';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { CustomerRequestPhotosService } from '../../customer-portal/customer-request-photos.service';
import { propertyOfProject } from '../../documents/document-links';
import type { Conversation } from '../chat-store';
import { filePaper } from '../file-paper';
import { FormFileKeeper, type KeptFormFile, showFormFiles } from '../forms/form-files';
import type { IncomingForm } from '../forms/form-reply-data';
import { FormSendService } from '../forms/form-send';
import { setStep } from './chat-step';
import { sayWithTaps } from './closing-taps';
import {
  askAgain,
  askExtra,
  askSince,
  type Draft,
  draftOf,
  startComplaint,
} from './complaint-start';
import { CATEGORY, type RaisedRequest, waitingDocuments } from './problem-raised';
import { releaseHeldFiles } from './waiting-files';
import { MEDIA_WORDS } from './words';

const MAX_FILES = 3;

/**
 * "Report a problem" (redesign §12): the form when published, else one tap at a time in the chat. The
 * category is the tap. The reply names who will call and when (a call task, escalated when missed).
 */
@Injectable()
export class ProblemFlowService {
  private readonly log = new Logger('WhatsApp');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly photos: CustomerRequestPhotosService,
    private readonly forms: FormSendService,
    private readonly files: FormFileKeeper,
  ) {}

  /** The report starts: the form when published, else the first chat question. */
  async start(chat: Conversation, customerId: string, topic?: string): Promise<void> {
    if (await this.forms.available('report_problem')) {
      const homes = await activeHomes(this.db, customerId);
      const start = problemFormStart(homes, topic ? { topic } : {});
      await this.forms.sendForm(chat, customerId, 'report_problem', start, PROBLEM_WORDS.askWhat);
      return;
    }
    return startComplaint(this.db, chat, customerId, topic);
  }

  /** A tap of the questions: what is wrong, since when, or Done. */
  async tapped(
    chat: Conversation,
    customerId: string,
    tap: Extract<CareTap, { t: 'what' | 'since' | 'done' }>,
  ): Promise<void> {
    const draft = draftOf(chat.context);
    if (!draft) return this.start(chat, customerId);
    if (tap.t === 'what') return askSince(this.db, chat, { ...draft, kind: tap.value });
    if (tap.t === 'since' && draft.kind)
      return askExtra(this.db, chat, { ...draft, since: tap.value });
    if (tap.t === 'done' && draft.kind && draft.since)
      return this.raise(chat, customerId, draft, '');
    return askAgain(this.db, chat, draft);
  }

  /** Words typed while the report waits: they are the "anything to add" once both questions are answered. */
  async words(chat: Conversation, customerId: string, said: string): Promise<void> {
    const draft = draftOf(chat.context);
    if (!draft) return this.start(chat, customerId);
    if (draft.stage !== 'extra' || !draft.kind || !draft.since)
      return askAgain(this.db, chat, draft);
    return this.raise(chat, customerId, draft, said.trim());
  }

  /** A stored photo or voice note sent while the report waits is kept for it. */
  async file(chat: Conversation, customerId: string, documentId: string): Promise<void> {
    const draft = draftOf(chat.context);
    if (!draft) return;
    const files = [...(draft.files ?? []), documentId].slice(0, MAX_FILES);
    const next: Draft = { ...draft, files };
    if (draft.stage === 'extra' && draft.kind && draft.since) {
      if (files.length >= MAX_FILES) return this.raise(chat, customerId, next, '');
      return askExtra(this.db, chat, next);
    }
    return askAgain(this.db, chat, next);
  }

  /** The form came back: every answer is a choice, so the report is raised at once. */
  async fromForm(chat: Conversation, customerId: string, form: IncomingForm, topic?: string) {
    const kind = PROBLEM_KINDS.find((one) => one === form.answers.what);
    const since = SINCE_CHOICES.find((one) => one === form.answers.since);
    const homes = await activeHomes(this.db, customerId);
    const offered = homes.slice(0, 10);
    const said = form.answers.home;
    const picked = offered.find((home) => home.id === said)?.id ?? null;
    const saved: Extract<KeptFormFile, { ok: true }>[] = [];
    for (const file of form.files.slice(0, MAX_FILES)) {
      const kept = await this.files.keep(chat, customerId, file);
      if (kept.ok) saved.push(kept);
    }
    const stored = saved.map((file) => file.id);
    if (saved.length > 0) await this.db.transaction((tx) => showFormFiles(tx, chat.id, saved));
    // An unknown home is asked in the chat; what the form already said (and its photos) goes along.
    if (said ? !picked : offered.length > 1)
      return startComplaint(this.db, chat, customerId, topic, {
        ...(kind ? { kind } : {}),
        ...(since ? { since } : {}),
        files: stored,
        note: form.answers.note ?? '',
      });
    const projectId = picked ?? offered[0]?.id ?? null;
    const draft: Draft = {
      stage: 'extra',
      projectId,
      topic,
      ...(kind ? { kind } : {}),
      ...(since ? { since } : {}),
    };
    if (!kind || !since)
      return askAgain(this.db, chat, { ...draft, stage: kind ? 'since' : 'what', files: stored });
    return this.raise(chat, customerId, { ...draft, files: stored }, form.answers.note ?? '');
  }

  /** Raises the report from the draft, then tells the customer who will call and when. */
  async raise(chat: Conversation, customerId: string, draft: Draft, words: string): Promise<void> {
    const kind = draft.kind ?? 'other';
    const since: Since = draft.since ?? 'today';
    const homes = await activeHomes(this.db, customerId);
    const projectId = draft.projectId ?? homes[0]?.id ?? null;
    const W = PROBLEM_LISTS.en;
    const description = [
      draft.topic === 'installation' ? 'Installation' : null,
      W.what[kind],
      W.sinceNote[since],
      words || draft.note || null,
    ]
      .filter(Boolean)
      .join(' · ');
    const request = await this.portal.raiseServiceRequest(customerId, {
      projectId,
      category: CATEGORY[kind],
      description,
    });
    const raised: RaisedRequest = { id: request.id, at: Date.now() };
    await setStep(this.db, chat, 'menu', { raised });
    await releaseHeldFiles(this.db, chat.id);
    const earlier = await waitingDocuments(this.db, chat.context);
    const files = [...new Set([...earlier, ...(draft.files ?? [])])].slice(0, MAX_FILES);
    let added = 0;
    for (const file of files) if (await this.attach(customerId, request.id, file)) added += 1;
    return this.promise(chat, customerId, request.id, projectId, kind, added < files.length);
  }

  /** The reply of a raised report: who calls, by when; the call task behind that promise. */
  private async promise(
    chat: Conversation,
    customerId: string,
    requestId: string,
    projectId: string | null,
    kind: ProblemKind,
    skipped: boolean,
  ) {
    const call = await promiseProblemCall(this.db, {
      customerId,
      requestId,
      projectId,
      kind,
      phone: chat.phone,
      timeZone: this.env.BUSINESS_TIMEZONE,
    });
    const home = projectId ? await homeNameOf(this.db, projectId) : null;
    const lines = [
      PROBLEM_WORDS.saved(
        PROBLEM_WORDS.what[kind],
        home,
        call.name ?? PROBLEM_WORDS.team,
        call.when,
      ),
      skipped ? MEDIA_WORDS.photoNotAdded : '',
    ];
    return sayWithTaps(this.db, chat, lines.filter(Boolean).join('\n\n'), ['problems', 'menu']);
  }

  /** More photos for the request just raised (the documents they were stored as). */
  async addPhotos(
    db: DatabaseExecutor,
    chat: Conversation,
    customerId: string,
    requestId: string,
    files: readonly string[],
  ) {
    const added: string[] = [];
    for (const file of files) if (await this.attach(customerId, requestId, file)) added.push(file);
    const body = added.length === files.length ? MEDIA_WORDS.photoAdded : MEDIA_WORDS.photoNotAdded;
    await sayWithTaps(db, chat, body, ['problems', 'menu']);
    return added;
  }

  /** A voice note sent right after a report joins it, and the person who calls is told. */
  async addVoice(chat: Conversation, customerId: string, requestId: string, documentId: string) {
    if (!(await this.attach(customerId, requestId, documentId))) return false;
    const person = await callerOfRequest(this.db, requestId, chat.phone);
    await sayWithTaps(this.db, chat, PROBLEM_WORDS.voiceAdded(person.name ?? PROBLEM_WORDS.team), [
      'problems',
      'menu',
    ]);
    return true;
  }

  /** The app's file rule (photos, one voice note); a refusal is not an error. Only the stored document moves. */
  private async attach(customerId: string, requestId: string, documentId: string) {
    try {
      const { projectId, category } = await this.photos.roomForStoredFile(
        customerId,
        requestId,
        documentId,
      );
      await this.db.transaction(async (tx) =>
        filePaper(tx, documentId, {
          projectId,
          propertyId: await propertyOfProject(tx, projectId),
          category,
          serviceRequestId: requestId,
        }),
      );
      return true;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this.log.log(`File not added to request ${requestId}: ${error.message}`);
      return false;
    }
  }
}

export { ADD_PHOTOS_MINUTES, type RaisedRequest, recentRequest } from './problem-raised';
