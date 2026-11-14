import { randomBytes } from 'node:crypto';
import type { OnboardStep } from '@oneohm/domain';
import { queueReply } from '../chat-store';
import { FORM_TOKEN_DAYS } from '../forms/flow-token';
import { showFormFiles } from '../forms/form-files';
import { linkFormReply } from '../forms/form-record';
import { WINDOW_MS } from '../forms/form-send';
import { FORM_WORDS } from '../forms/form-words';
import type { Incoming, IncomingMedia } from '../whatsapp-events';
import { firstMissing, stepOfState } from './onboarding-context';
import type { ChatFilesService } from './onboarding-files';
import { answersFromForm, FORM_STEPS } from './onboarding-form-answers';
import { onboardingFormFallback, onboardingFormStart } from './onboarding-form-words';
import { saveTurn, speak, type Turn } from './onboarding-turn';
import { takeChatFile } from './onboarding-turn-files';

/** What the form's answers need from the chat's own steps (the same code the typed answers use). */
export interface FormSteps {
  /** An answer kept, written on the lead (made at the city), with its history note; the lead's id. */
  readonly record: (turn: Turn, step: OnboardStep, answer: unknown) => Promise<string | null>;
  readonly ask: (turn: Turn, step: OnboardStep) => Promise<null>;
  /** The end of onboarding: the estimate PDF and next-step buttons, or the expert path. */
  readonly finish: (turn: Turn, leadId: string | null) => Promise<null>;
}

/**
 * Right after the language is chosen: sends the onboarding form when it is published and the chat window is
 * open. The chat stays on the name question, so typed words and taps keep working; the form never blocks it.
 * False (nothing sent) means the chat asks the name question as always.
 */
export async function offerForm(turn: Turn, flowId: string | null): Promise<boolean> {
  const { chat } = turn;
  const open = chat.lastInboundAt && Date.now() - chat.lastInboundAt.getTime() < WINDOW_MS;
  if (!flowId || !open) return false;
  const token = randomBytes(18).toString('base64url');
  turn.form = { token, sentAt: new Date().toISOString() };
  await saveTurn(turn, 'name');
  await speak(turn, () => {
    const start = onboardingFormStart(turn.settings, chat.profileName);
    return queueReply(turn.tx, chat, {
      kind: 'flow',
      body: start.body,
      button: start.button,
      flowId,
      token,
      screen: start.screen,
      data: start.data,
      fallbackText: onboardingFormFallback(),
    });
  });
  return true;
}

/** The form's bill photo, as the media the chat downloads (before the chat row is locked). */
export function mediaOfForm(form: Incoming['form']): IncomingMedia | null {
  const file = form?.files[0];
  if (!file) return null;
  const image = file.mimeType?.startsWith('image/') ?? true;
  return {
    type: image ? 'image' : 'document',
    id: file.id,
    mimeType: file.mimeType,
    fileName: file.fileName,
  };
}

const usable = (turn: Turn, token: string | null): boolean => {
  const sent = turn.form?.sentAt ? Date.parse(turn.form.sentAt) : Number.NaN;
  return (
    token !== null && turn.form?.token === token && Date.now() - sent < FORM_TOKEN_DAYS * 86_400_000
  );
};

/** The form's bill photo filed as the chat's bill photo, or "send later" when there is none. */
async function fileBill(
  turn: Turn,
  form: NonNullable<Incoming['form']>,
  files: ChatFilesService,
  steps: FormSteps,
): Promise<string | null> {
  const media = form.files[0]?.id;
  if (media) {
    // The bill shows on the form's card in the staff chat, named "Bill photo".
    const show = (id: string) => showFormFiles(turn.tx, turn.chat.id, [{ id, media }]);
    const outcome = await takeChatFile(turn, files, 'photo', show);
    return outcome === 'filed' ? steps.record(turn, 'photo', 'sent') : null;
  }
  return turn.answers.photo === undefined ? steps.record(turn, 'photo', 'later') : null;
}

/**
 * The reply to the onboarding form (`nfm_reply`). Its token is ours, unused and not expired, and onboarding
 * is not finished; otherwise "That form is old" and the question the chat is on. The answers go through the
 * chat's own steps in order (name, city, site, bill, roof, floors), so the lead, owner, campaign, history
 * notes and floors are exactly as from typing; the bill photo is filed as the chat's bill photo, or "send
 * later" when there is none. Whatever the form left unclear is asked next in the chat; when all is answered
 * the estimate follows.
 */
export async function takeForm(
  turn: Turn,
  incoming: Incoming,
  files: ChatFilesService,
  steps: FormSteps,
): Promise<null> {
  const form = incoming.form;
  const current = stepOfState(turn.chat.state) ?? firstMissing(turn.answers, turn.known);
  if (!form || current === 'done' || !usable(turn, form.token)) {
    await speak(turn, () => queueReply(turn.tx, turn.chat, { kind: 'text', body: FORM_WORDS.old }));
    return current === 'done' ? null : steps.ask(turn, current);
  }
  turn.form = undefined;
  turn.misses = 0;
  turn.awaiting = undefined;
  const got = answersFromForm(form.answers, turn.settings);
  let leadId: string | null = null;
  for (const step of FORM_STEPS) {
    const value = got.values[step];
    if (value !== undefined) leadId = (await steps.record(turn, step, value)) ?? leadId;
  }
  leadId = (await fileBill(turn, form, files, steps)) ?? leadId;
  const made = leadId ?? turn.lead?.id ?? null;
  if (made) await linkFormReply(turn.tx, turn.chat.id, { kind: 'lead', id: made });
  const next = firstMissing(turn.answers, turn.known);
  if (next === 'done') return steps.finish(turn, leadId ?? turn.lead?.id ?? null);
  if (next === 'city' && got.otherCity) turn.awaiting = 'city';
  return steps.ask(turn, next);
}
