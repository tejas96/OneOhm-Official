import { Inject, Injectable, Logger } from '@nestjs/common';
import { projects } from '@oneohm/database';
import { desc, eq } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { CustomerRequestPhotosService } from '../../customer-portal/customer-request-photos.service';
import type { IncomingFile } from '../../documents/upload-file';
import { type Conversation, queueReply, setState } from '../chat-store';
import { sayWithTaps } from './closing-taps';
import { guessCategory } from './guess-category';
import { CATEGORY_WORDS, MEDIA_WORDS, WORDS } from './words';

/** For this long after a request is raised, more photos sent are added to it. */
export const ADD_PHOTOS_MINUTES = 30;

/** What the chat remembers after raising a request, so the next photos join it. */
export interface RaisedRequest {
  readonly id: string;
  readonly at: number;
}

/** The request raised in this chat a moment ago, if photos may still join it. */
export function recentRequest(context: unknown, now: number): RaisedRequest | null {
  const raised = (context as { raised?: RaisedRequest } | null)?.raised;
  if (!raised?.id || typeof raised.at !== 'number') return null;
  return now - raised.at <= ADD_PHOTOS_MINUTES * 60_000 ? raised : null;
}

/**
 * "Report a problem" (PRD 6.1): the customer's words become a service request on their
 * newest project, with any photos they sent attached, exactly as in the app.
 */
@Injectable()
export class ProblemFlowService {
  private readonly log = new Logger('WhatsApp');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly portal: CustomerPortalService,
    private readonly photos: CustomerRequestPhotosService,
  ) {}

  async raise(
    chat: Conversation,
    customerId: string,
    said: string,
    files: readonly IncomingFile[] = [],
  ): Promise<void> {
    const typed = said.trim();
    // A photo with no words (or one word) still raises a request; the photo says the rest.
    const words = typed.length >= 5 || files.length === 0 ? typed : MEDIA_WORDS.photoOnly;
    if (words.length < 5) return this.text(chat, WORDS.tooShort);
    const { category, label: plain } = guessCategory(words);
    const label = CATEGORY_WORDS[category] ?? plain;
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.customerId, customerId))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    const request = await this.portal.raiseServiceRequest(customerId, {
      projectId: project?.id ?? null,
      category,
      description: `${words} (via WhatsApp)`,
    });
    const raised: RaisedRequest = { id: request.id, at: Date.now() };
    await setState(this.db, chat.id, 'menu', { raised });
    let added = 0;
    for (const file of files) if (await this.attach(customerId, request.id, file)) added += 1;
    const lines = [
      added > 0 ? MEDIA_WORDS.problemSavedWithPhotos(label, added) : WORDS.problemSaved(label),
      added < files.length ? MEDIA_WORDS.photoNotAdded : '',
    ];
    return sayWithTaps(this.db, chat, lines.filter(Boolean).join('\n\n'), ['requests', 'menu']);
  }

  /** Another photo for the request just raised. */
  async addPhoto(chat: Conversation, customerId: string, requestId: string, file: IncomingFile) {
    const added = await this.attach(customerId, requestId, file);
    return this.text(chat, added ? MEDIA_WORDS.photoAdded : MEDIA_WORDS.photoNotAdded);
  }

  /** The app's own photo rule (photos only, six at most); a refusal is not an error. */
  private async attach(customerId: string, requestId: string, file: IncomingFile) {
    try {
      await this.photos.add(customerId, requestId, file);
      return true;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this.log.log(`Photo not added to request ${requestId}: ${error.message}`);
      return false;
    }
  }

  private async text(chat: Conversation, body: string): Promise<void> {
    await queueReply(this.db, chat, { kind: 'text', body });
  }
}
