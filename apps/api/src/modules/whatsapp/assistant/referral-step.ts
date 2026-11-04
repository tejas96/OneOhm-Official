import type { Database } from '@oneohm/database';
import { AppError } from '../../../common/http/errors';
import type { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import type { Conversation } from '../chat-store';
import { setStep } from './chat-step';
import { sayWithTaps } from './closing-taps';
import { readReferral } from './guess-category';
import { WORDS } from './words';

/** The friend's name and number a customer typed (redesign §15): referred, or why not. */
export async function takeReferral(
  db: Database,
  portal: CustomerPortalService,
  chat: Conversation,
  customerId: string,
  text: string,
) {
  const friend = readReferral(text);
  if (!friend) return sayWithTaps(db, chat, WORDS.referralUnclear, ['menu']);
  await setStep(db, chat, 'menu');
  try {
    await portal.refer(customerId, friend);
  } catch (error) {
    if (error instanceof AppError && error.code === 'duplicate')
      return sayWithTaps(db, chat, WORDS.referralKnown, ['menu']);
    if (error instanceof AppError) return sayWithTaps(db, chat, error.message, ['menu']);
    throw error;
  }
  return sayWithTaps(db, chat, WORDS.referralSaved(friend.name), ['rewards', 'menu']);
}
