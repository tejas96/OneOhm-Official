import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { activeHomes } from '../../customer-portal/active-projects';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { CustomerRequestPhotosService } from '../../customer-portal/customer-request-photos.service';
import { propertyOfProject } from '../../documents/document-links';
import type { Conversation } from '../chat-store';
import { filePaper } from '../file-paper';
import { setStep } from './chat-step';
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
 * "Report a problem" (PRD 6.1): the customer's words become a service request on the home
 * they picked (or their only active one), with any photos sent attached, as in the app.
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
    files: readonly string[] = [],
  ): Promise<void> {
    const typed = said.trim();
    // A photo with no words (or one word) still raises a request; the photo says the rest.
    const words = typed.length >= 5 || files.length === 0 ? typed : MEDIA_WORDS.photoOnly;
    if (words.length < 5) return sayWithTaps(this.db, chat, WORDS.tooShort, ['menu']);
    const { category, label: plain } = guessCategory(words);
    const label = CATEGORY_WORDS[category] ?? plain;
    // The home picked from the list (menu audit M10), else the newest active one (M7).
    const picked = (chat.context as { projectId?: string } | null)?.projectId;
    const projectId = picked ?? (await activeHomes(this.db, customerId))[0]?.id ?? null;
    const request = await this.portal.raiseServiceRequest(customerId, {
      projectId,
      category,
      description: `${words} (via WhatsApp)`,
    });
    const raised: RaisedRequest = { id: request.id, at: Date.now() };
    await setStep(this.db, chat, 'menu', { raised });
    let added = 0;
    for (const file of files) if (await this.attach(customerId, request.id, file)) added += 1;
    const lines = [
      added > 0 ? MEDIA_WORDS.problemSavedWithPhotos(label, added) : WORDS.problemSaved(label),
      added < files.length ? MEDIA_WORDS.photoNotAdded : '',
    ];
    return sayWithTaps(this.db, chat, lines.filter(Boolean).join('\n\n'), ['problems', 'menu']);
  }

  /** Another photo for the request just raised (the document it was stored as). */
  async addPhoto(chat: Conversation, customerId: string, requestId: string, file: string) {
    const added = await this.attach(customerId, requestId, file);
    const body = added ? MEDIA_WORDS.photoAdded : MEDIA_WORDS.photoNotAdded;
    return sayWithTaps(this.db, chat, body, ['problems', 'menu']);
  }

  /**
   * The app's own photo rule (photos only, six at most); a refusal is not an error. The
   * photo was stored when it arrived: only that same document moves onto the problem.
   */
  private async attach(customerId: string, requestId: string, documentId: string) {
    try {
      const { projectId } = await this.photos.roomForStoredPhoto(customerId, requestId, documentId);
      await this.db.transaction(async (tx) =>
        filePaper(tx, documentId, {
          projectId,
          propertyId: await propertyOfProject(tx, projectId),
          category: 'site_photo',
          serviceRequestId: requestId,
        }),
      );
      return true;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this.log.log(`Photo not added to request ${requestId}: ${error.message}`);
      return false;
    }
  }
}
