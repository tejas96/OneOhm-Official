import type { DatabaseExecutor } from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import { AppError } from '../../../common/http/errors';
import type { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { filePaper, type PaperPlace } from '../file-paper';
import type { Chosen } from './files-wait';
import { answersRequests, type KeptFile } from './kept-files';
import type { OpenPaper } from './paper-match';
import { placeOf } from './paper-reads';

/** What filing the files did: the request the first one answered, if any. */
export interface FiledAs {
  readonly answered: OpenPaper | null;
}

/** A home paper asked for with no project lands on the home it was sent for. */
function onHome(filed: PaperPlace | null, place: PaperPlace): PaperPlace | null {
  if (!filed || filed.propertyId || !place.propertyId) return null;
  if (isPersonDocumentCategory(filed.category)) return null;
  return { projectId: place.projectId, propertyId: place.propertyId, category: filed.category };
}

/**
 * Files the customer's kept files as the paper they picked, on the place chosen for them.
 * The first photo or PDF answers the asked paper (as an upload in the app does: received,
 * renamed, the asker and task owners told); the rest of the batch (the back of a card) is
 * filed with it. A Word or Excel file, a voice note or a video is only kept on the home.
 */
export async function fileAs(
  tx: DatabaseExecutor,
  requests: Pick<CustomerDocumentRequestsService, 'answerWithDocument'>,
  customerId: string,
  files: readonly KeptFile[],
  chosen: Chosen,
  place: PaperPlace,
  asked: readonly OpenPaper[],
): Promise<FiledAs> {
  const papers = files.filter((file) => answersRequests(file.contentType));
  let landed = place;
  let answered: OpenPaper | null = null;
  let rest = papers;
  const request = chosen.kind === 'ask' ? asked.find((one) => one.id === chosen.actionId) : null;
  const [first] = papers;
  if (request && first) {
    try {
      await requests.answerWithDocument(customerId, request.id, first.id, tx);
      answered = request;
      rest = papers.slice(1);
      const filed = await placeOf(tx, first.id);
      const moved = onHome(filed, place);
      if (moved) await filePaper(tx, first.id, moved);
      landed = moved ?? filed ?? place;
    } catch (error) {
      // Answered a moment ago: the files are still kept, on the home, as that kind.
      if (!(error instanceof AppError)) throw error;
    }
  }
  for (const file of rest) await filePaper(tx, file.id, landed);
  const others = files.filter((file) => !answersRequests(file.contentType));
  for (const file of others) await filePaper(tx, file.id, { ...place, category: 'other' });
  return { answered };
}
