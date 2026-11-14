import { waConversations } from '@oneohm/database';
import type { OnboardAnswers, OnboardStep } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { LeadIntakeService } from '../../crm/lead-intake.service';
import type { ChatFilesService } from './onboarding-files';
import { openLeadFor, writeAnswer } from './onboarding-lead';
import { notePin } from './onboarding-pin';
import type { Turn } from './onboarding-turn';
import { fileHeldBill } from './onboarding-turn-files';

/**
 * A clear answer kept in the chat and written on the lead (the city answer makes the lead: owner by rule,
 * campaign, history notes). The lead is then the turn's, so answers after it in the same turn are written
 * on it too. Returns the lead's id, or null while there is none. Used by typed answers and by the form.
 */
export async function recordAnswer(
  turn: Turn,
  deps: { readonly intake: LeadIntakeService; readonly files: ChatFilesService },
  step: OnboardStep,
  answer: unknown,
): Promise<string | null> {
  const { tx, chat } = turn;
  turn.answers = { ...turn.answers, [step]: answer } as OnboardAnswers;
  turn.misses = 0;
  turn.awaiting = undefined;
  if (step === 'language')
    await tx
      .update(waConversations)
      .set({ language: String(answer) })
      .where(eq(waConversations.id, chat.id));
  const written = await writeAnswer(tx, deps.intake, {
    chat,
    lead: turn.lead,
    step,
    answers: turn.answers,
    settings: turn.settings,
  });
  turn.dropEntry ||= written.created;
  if (written.created) turn.lead = await openLeadFor(tx, chat.phone);
  if (written.leadId) await fileHeldBill(turn, deps.files, written.leadId);
  const leadId = written.leadId ?? turn.lead?.id ?? null;
  if (step === 'city' && leadId) await notePin(turn, leadId);
  return leadId;
}
