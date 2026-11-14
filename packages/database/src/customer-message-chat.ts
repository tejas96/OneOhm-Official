import { customerNotice } from './customer-message';
import { localValues } from './customer-message-words';

type Payload = Readonly<Record<string, string>>;
type Language = 'en' | 'mr' | 'hi';

/**
 * Two news items said as one natural chat sentence (not a title and a body) for a customer
 * whose chat is open: the step update and the service update.
 */
const SENTENCES: Readonly<Record<string, Readonly<Record<Language, (p: Payload) => string>>>> = {
  project_milestone: {
    en: (p) => `Update on your solar project${p.project ? ` ${p.project}` : ''}: ${p.milestone}.`,
    mr: (p) =>
      `तुमच्या सोलर प्रकल्पाची${p.project ? ` (${p.project})` : ''} नवी माहिती: ${p.milestone}.`,
    hi: (p) =>
      `आपके सोलर प्रोजेक्ट${p.project ? ` (${p.project})` : ''} की नई जानकारी: ${p.milestone}।`,
  },
  service_update: {
    en: (p) => `Update on your service request, ${p.topic}: ${p.status}.`,
    mr: (p) => `तुमच्या सर्व्हिस विनंतीची माहिती, ${p.topic}: ${p.status}.`,
    hi: (p) => `आपके सर्विस अनुरोध की जानकारी, ${p.topic}: ${p.status}।`,
  },
};

const codeOf = (language: string | undefined): Language =>
  language === 'mr-IN' ? 'mr' : language === 'hi-IN' ? 'hi' : 'en';

/**
 * A customer message as chat text in the customer's language (for an open chat window),
 * or null when the message has no words to say. Uses the same Marathi and Hindi names as
 * the Marathi and Hindi templates and the app inbox.
 */
export function chatSentence(
  template: string,
  payload: Payload,
  language: string | undefined,
): string | null {
  const code = codeOf(language);
  const sentence = SENTENCES[template]?.[code];
  if (sentence) return sentence(localValues(language, template, payload) as Payload);
  const notice = customerNotice(template, payload, 'chat', language);
  if (!notice) return null;
  return notice.body ? `${notice.title}: ${notice.body}` : notice.title;
}
