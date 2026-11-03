import type { DatabaseExecutor } from '@oneohm/database';
import type { OnboardAnswers } from '@oneohm/domain';
import { type Conversation, queueReply } from '../chat-store';
import type { QuestionView } from './onboarding-replies';
import { question } from './onboarding-replies';

/**
 * The end of onboarding, after the photo question: for now a thank-you saying the
 * estimate is being prepared. The instant estimate (Part 3, Task 5) replaces this one
 * function; the chat is already on `onboard:done` when it runs.
 */
export async function finishOnboarding(
  tx: DatabaseExecutor,
  chat: Conversation,
  _leadId: string | null,
  _answers: OnboardAnswers,
  view: QuestionView,
): Promise<void> {
  await queueReply(tx, chat, question('done', view));
}
