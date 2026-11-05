import { addDays } from '@oneohm/shared';
import type { VisitKind, VisitSlot } from './visit-rules';

/** The three languages customers read (English, Marathi, Hindi). */
export type VisitLanguage = 'en' | 'mr' | 'hi';

/**
 * The short phrases of a visit that the API's chat messages and the worker's template values
 * both use, so a Marathi customer never reads English inside a Marathi message.
 */
export const VISIT_PHRASES: Readonly<
  Record<
    VisitLanguage,
    {
      readonly work: Readonly<Record<VisitKind, string>>;
      readonly slots: Readonly<Record<VisitSlot, string>>;
      readonly tomorrow: string;
      readonly on: string;
    }
  >
> = {
  en: {
    work: {
      survey: 'site survey',
      installation: 'installation',
      inspection: 'DISCOM inspection',
      net_meter: 'net meter fitting',
      amc: 'free AMC visit',
      service: 'service visit',
    },
    slots: { morning: 'morning', afternoon: 'afternoon' },
    tomorrow: 'tomorrow',
    on: 'on',
  },
  mr: {
    work: {
      survey: 'साईट सर्व्हे',
      installation: 'इन्स्टॉलेशन',
      inspection: 'DISCOM तपासणी',
      net_meter: 'नेट मीटर जोडणी',
      amc: 'मोफत AMC भेट',
      service: 'सर्व्हिस भेट',
    },
    slots: { morning: 'सकाळी', afternoon: 'दुपारी' },
    tomorrow: 'उद्या',
    on: '',
  },
  hi: {
    work: {
      survey: 'साइट सर्वे',
      installation: 'इंस्टॉलेशन',
      inspection: 'DISCOM निरीक्षण',
      net_meter: 'नेट मीटर लगाने',
      amc: 'मुफ़्त AMC विज़िट',
      service: 'सर्विस विज़िट',
    },
    slots: { morning: 'सुबह', afternoon: 'दोपहर' },
    tomorrow: 'कल',
    on: '',
  },
};

const LOCALES: Record<VisitLanguage, string> = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };

/** "Thu 6 Nov" in the customer's language. */
export function visitDayLabel(day: string, language: VisitLanguage): string {
  const parts = new Intl.DateTimeFormat(LOCALES[language], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${day}T00:00:00Z`));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}

/** "tomorrow morning" the day before the visit, else "on Mon 9 Nov, morning". */
export function visitReminderWhen(
  day: string,
  today: string,
  slot: VisitSlot,
  language: VisitLanguage,
): string {
  const phrases = VISIT_PHRASES[language];
  if (day === addDays(today, 1)) return `${phrases.tomorrow} ${phrases.slots[slot]}`;
  const on = phrases.on ? `${phrases.on} ` : '';
  return `${on}${visitDayLabel(day, language)}, ${phrases.slots[slot]}`;
}
