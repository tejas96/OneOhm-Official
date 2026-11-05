import { type SurveyItem } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import type { Built } from '../send-to-customer/send-messages';
import { CHAT_WORDS } from '../whatsapp/assistant/chat-words';
import type { ChatReply } from '../whatsapp/chat-reply';
import { answerTap, startTap, visitTap } from './survey-taps';
import { SURVEY_WORDS } from './survey-words';

/** The offer: the sentence with the credit, [Start survey] and [Book a visit instead]; the template outside 24 h. */
export function offerBuilt(customer: string, home: string, paise: number, id: string): Built {
  return {
    replies: [
      {
        kind: 'buttons',
        body: SURVEY_WORDS.offer(formatInr(paise)),
        buttons: [
          { id: startTap(id), title: SURVEY_WORDS.buttons.start },
          { id: visitTap(id), title: SURVEY_WORDS.buttons.visit },
        ],
      },
    ],
    template: {
      key: 'self_survey_offer',
      payload: {
        customer: titleCaseName(customer.split(/\s+/)[0] ?? customer),
        home,
        amount: formatInr(paise),
        startPayload: startTap(id),
        visitPayload: visitTap(id),
      },
    },
  };
}

const CHOICES = ['roof', 'floors', 'shade', 'size'] as const;
type Choice = (typeof CHOICES)[number];
const isChoice = (item: SurveyItem): item is Choice =>
  (CHOICES as readonly string[]).includes(item);

/** One question in the chat: a list for a choice, plain words for a photo or the consumer number. */
export function questionReply(actionId: string, item: SurveyItem): ChatReply {
  const body = SURVEY_WORDS.ask[item];
  if (!isChoice(item)) return { kind: 'text', body };
  const titles = SURVEY_WORDS.options[item] as Readonly<Record<string, string>>;
  return {
    kind: 'list',
    body,
    button: CHAT_WORDS.listButton,
    rows: Object.entries(titles).map(([value, title]) => ({
      id: answerTap(actionId, item, value),
      title,
    })),
  };
}
