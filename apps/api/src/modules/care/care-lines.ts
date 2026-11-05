import { formatInr } from '@oneohm/shared';
import { SEND_WORDS } from '../send-to-customer/send-words';
import { plainDate } from '../whatsapp/assistant/plain-date';
import { AMC_WORDS } from './amc-words';
import type { CareAsk } from './care-pending';
import { careTaps } from './care-taps';
import { PROBLEM_WORDS } from './problem-words';
import { RATING_WORDS } from './rating-words';
import { REFER_WORDS } from './refer-words';

/** Home's one line for a care question (redesign §3). */
export function careLine(item: CareAsk): string {
  if (item.ask === 'rate')
    return item.stage
      ? RATING_WORDS.homeStage(RATING_WORDS.stage[item.about] ?? item.about)
      : RATING_WORDS.homeProblem(item.about);
  if (item.ask === 'upi') return REFER_WORDS.upiAsk(formatInr(item.amountPaise));
  if (item.ask === 'fixed') return PROBLEM_WORDS.homeFixed(item.about);
  return AMC_WORDS.offer(
    item.home ?? SEND_WORDS.location.anyHome,
    item.endsOn ? plainDate(item.endsOn) : '',
  );
}

/** The button that answers it. */
export function careButton(item: CareAsk): { id: string; title: string } {
  if (item.ask === 'rate')
    return { id: careTaps.rateGo(item.requestId), title: RATING_WORDS.rateNow };
  if (item.ask === 'upi') return { id: careTaps.upi(item.requestId), title: REFER_WORDS.upiButton };
  if (item.ask === 'fixed')
    return { id: careTaps.fixedShow(item.requestId), title: PROBLEM_WORDS.answerNow };
  return { id: careTaps.amcRenew(item.requestId), title: AMC_WORDS.renew };
}
