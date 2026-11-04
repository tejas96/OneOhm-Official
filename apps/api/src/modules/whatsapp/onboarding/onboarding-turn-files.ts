import type { OnboardStep } from '@oneohm/domain';
import type { LeadIntakeService } from '../../crm/lead-intake.service';
import { ensureChatOwner, tellChatTeam } from '../chat-owner';
import { linkChatFile, queueReply } from '../chat-store';
import { ONBOARD_WORDS } from './onboard-words';
import { type ChatFilesService, type FileOutcome, fileWords } from './onboarding-files';
import { makeLead, NO_NAME } from './onboarding-lead';
import { speak, type Turn } from './onboarding-turn';

/**
 * A photo or paper in this turn: filed on the lead, or held until the lead is made. The
 * customer is told what happened; the caller then asks the question again. A file is never
 * an unclear answer. A filed bill also means the photo question needs no asking.
 */
export async function takeChatFile(
  turn: Turn,
  files: ChatFilesService,
  step: OnboardStep,
): Promise<FileOutcome> {
  const { tx, chat } = turn;
  const got = await files.receive(tx, turn.file, {
    id: chat.id,
    leadId: turn.lead?.id ?? null,
    pending: turn.pendingFile,
  });
  turn.discard.push(...got.discard);
  if (got.pending) turn.pendingFile = got.pending;
  if (got.outcome === 'filed') turn.answers = { ...turn.answers, photo: 'sent' };
  await speak(turn, () => queueReply(tx, chat, { kind: 'text', body: fileWords(got.outcome) }));
  // After the estimate nobody is waiting on a question, so the owner is told of the bill.
  if (got.outcome === 'filed' && step === 'done') {
    const owned = await ensureChatOwner(tx, chat);
    await tellChatTeam(tx, owned, {
      kind: 'whatsapp_handover',
      title: 'New bill received on WhatsApp',
      body: `${chat.profileName ?? 'A customer'} · ${chat.phone}. New bill received after the estimate.`,
      key: `wa_bill:${chat.id}:${Date.now()}`,
    });
  }
  return got.outcome;
}

/** The lead exists now: a bill held in the chat is filed on it, in this transaction. */
export async function fileHeldBill(
  turn: Turn,
  files: ChatFilesService,
  leadId: string,
): Promise<void> {
  const held = turn.pendingFile;
  if (!held) return;
  // If it cannot be filed the object and `ob.pendingFile` stay, so it can be recovered.
  const documentId = await files.filePendingBill(turn.tx, leadId, held);
  if (!documentId) return;
  await linkChatFile(turn.tx, held.mediaId, documentId);
  turn.answers = { ...turn.answers, photo: 'sent' };
  turn.discard.push(held.storageKey);
  turn.pendingFile = undefined;
}

/**
 * Before a person takes the chat, or the estimate is made, there must be a lead, so nothing
 * stays only in chat: the open lead's id, or a lead made now (city "Not given" unless
 * answered) with any held bill filed on it. Stalled chats (Task 7) call this too, with
 * their own next-action note.
 */
export async function ensureLead(
  turn: Turn,
  deps: { readonly intake: LeadIntakeService; readonly files: ChatFilesService },
  nextActionNote = 'Call — asked for a person during onboarding',
): Promise<string> {
  if (turn.lead) return turn.lead.id;
  const { tx, chat, answers } = turn;
  const leadId = await makeLead(tx, deps.intake, chat, answers, NO_NAME.handOver, nextActionNote);
  turn.dropEntry = true;
  await fileHeldBill(turn, deps.files, leadId);
  return leadId;
}

/** A voice note or a video: a person listens or watches and replies (C12, fix round 1). */
export type HeardMedia = 'audio' | 'video';

/** The media type when it is a voice note or a video, else null. */
export const heardMedia = (type: string | undefined): HeardMedia | null =>
  type === 'audio' || type === 'video' ? type : null;

/** The lead's next action and the staff note for each. */
export const HEARD: Record<HeardMedia, { readonly call: string; readonly note: string }> = {
  audio: { call: 'Call — sent a voice note during onboarding', note: 'Sent a voice note' },
  video: { call: 'Call — sent a video during onboarding', note: 'Sent a video' },
};

/** The warm reply, in the language being spoken, naming who will reply. */
export const heardReply = (media: HeardMedia, name: string | null) =>
  media === 'audio' ? ONBOARD_WORDS.voiceHandOver(name) : ONBOARD_WORDS.videoHandOver(name);
