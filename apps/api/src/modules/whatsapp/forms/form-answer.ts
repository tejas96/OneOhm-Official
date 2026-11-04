import type { DatabaseExecutor } from '@oneohm/database';
import type { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { customerHomes } from '../../customer-portal/customer-homes';
import { fileAs } from '../assistant/file-as';
import { type Chosen, filesWaitOf, withBatch, withFile } from '../assistant/files-wait';
import { saveWait } from '../assistant/files-wait-store';
import { type KeptFile, placeOn } from '../assistant/kept-files';
import { openPapersOf } from '../assistant/paper-reads';
import { savedTitle, saySaved, stillAsked } from '../assistant/what-saved';
import { targetOf } from '../assistant/what-targets';
import type { Conversation } from '../chat-store';

/**
 * Files from a "Send a paper" form answer the paper the form was sent for (the customer
 * chose it, so there is no "What is this?"): filed as that paper, then the normal Saved
 * reply with [Change]. Several files are the front and back of the same paper. When the
 * paper is no longer asked for, or its home cannot be told, nothing is guessed: the files
 * wait and "What is this?" asks, as for any photo sent in the chat. Returns whether the
 * Saved reply went out.
 */
export async function answerFromForm(
  tx: DatabaseExecutor,
  requests: Pick<CustomerDocumentRequestsService, 'answerWithDocument'>,
  chat: Conversation,
  customerId: string,
  about: {
    chosen: Chosen;
    files: readonly (KeptFile & { media: string })[];
    now: number;
    waitSeconds: number;
    /** The home the customer picked for an asked paper that had none ("For which home?"). */
    homeId?: string | null;
  },
): Promise<boolean> {
  const { chosen, files, now } = about;
  const homes = await customerHomes(tx, customerId);
  const asked = await openPapersOf(tx, customerId);
  const found = await targetOf(tx, chosen, asked, homes.length, homes[0]?.propertyId ?? null);
  const picked = homes.find((h) => h.propertyId === about.homeId)?.propertyId ?? null;
  const target = found && found.home === null && picked ? { ...found, home: picked } : found;
  const request =
    chosen.kind === 'ask' ? asked.find((one) => one.id === chosen.actionId) : undefined;
  if (!target || (chosen.kind === 'ask' && !request) || target.home === null) {
    await waitForQuestion(tx, chat, files, now, about.waitSeconds);
    return false;
  }
  const place = placeOn(homes, target.home, target.category) ?? {
    projectId: null,
    propertyId: null,
    category: target.category,
  };
  const { answered } = await fileAs(tx, requests, customerId, files, chosen, place, asked);
  const [first] = files;
  await saySaved(tx, chat, {
    title: savedTitle(request, target),
    home: homes.find((home) => home.propertyId === target.home) ?? null,
    count: files.length,
    firstId: first?.id ?? '',
    left: stillAsked(asked, target, homes.length, answered?.id)[0],
  });
  const batches = withBatch(
    chat.context,
    files.map((file) => file.id),
    now,
  );
  await saveWait(tx, chat, filesWaitOf(chat.context), { filedBatches: batches });
  return true;
}

/** The files wait like any photo sent in the chat; "What is this?" comes after the usual pause. */
async function waitForQuestion(
  tx: DatabaseExecutor,
  chat: Conversation,
  files: readonly (KeptFile & { media: string })[],
  now: number,
  waitSeconds: number,
): Promise<void> {
  let context: unknown = chat.context;
  let wait = filesWaitOf(context);
  for (const file of files) {
    const type = file.contentType.startsWith('image/') ? ('image' as const) : ('document' as const);
    wait = withFile(context, { id: file.id, media: file.media, type, at: now }, now, waitSeconds);
    context = { ...(context as object), filesWait: wait };
  }
  await saveWait(tx, chat, wait);
}
