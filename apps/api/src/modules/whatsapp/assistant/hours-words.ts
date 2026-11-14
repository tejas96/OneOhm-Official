import {
  type CallDay,
  clockShort,
  clockText,
  confirmByMin,
  daysText,
  hoursText,
  nextOpening,
  onWeekday,
  openClock,
  openingText,
  partOfDay,
  type ReplyTime,
  toDevanagari,
  WEEKDAY_NAMES,
  type WordsLang,
} from '@oneohm/domain';
import { currentCalendar } from '../../../common/calendar';

/**
 * The working hours as customers are told them, written from the business calendar in Settings
 * (Working time & holidays), so a changed day or hour reaches every text with no edit here.
 */
export const openingNow = (lang: WordsLang): string => openingText(currentCalendar(), lang);

/** The weekday the office next opens on, for "on Monday" when the answer is not today or tomorrow. */
export const laterWeekday = (): number => nextOpening(new Date(), currentCalendar()).weekday;

/** "here soon (Mon–Sat, 9:30–6:30)" … "on Monday after 9:30": when a person replies, per language. */
export function replyWhen(when: ReplyTime, lang: WordsLang): string {
  const cal = currentCalendar();
  const open = openClock(cal, lang);
  const part = lang === 'en' ? '' : `${partOfDay(cal.startMin, lang)} `;
  const hours = `${daysText(cal, lang)}, ${hoursText(cal, lang)}`;
  if (lang === 'en') {
    if (when === 'now') return `here soon (${openingNow('en')})`;
    if (when === 'today') return `here today from ${open}`;
    if (when === 'tomorrow') return `here tomorrow from ${open}`;
    return `here ${onWeekday(laterWeekday(), 'en')} from ${open}`;
  }
  const after = lang === 'mr' ? 'नंतर' : 'के बाद';
  if (when === 'now') return `${lang === 'mr' ? 'लवकरच' : 'जल्द ही'} (${hours})`;
  if (when === 'today') return `${lang === 'mr' ? 'आज' : 'आज'} ${part}${open} ${after}`;
  if (when === 'tomorrow') return `${lang === 'mr' ? 'उद्या' : 'कल'} ${part}${open} ${after}`;
  return `${onWeekday(laterWeekday(), lang)} ${part}${open} ${after}`;
}

/** The day a call is promised, said short: "today", "tomorrow", "on Monday". */
export function callWord(when: ReplyTime | CallDay, lang: WordsLang): string {
  if (when === 'now' || when === 'today') return { en: 'today', mr: 'आज', hi: 'आज' }[lang];
  if (when === 'tomorrow') return { en: 'tomorrow', mr: 'उद्या', hi: 'कल' }[lang];
  const day = onWeekday(laterWeekday(), lang);
  return lang === 'hi' ? `${day} को` : day;
}

/** "9:30" / "सकाळी ९:३०": a morning opening time, with the part of the day outside English. */
const openingAt = (lang: WordsLang, numerals: boolean): string => {
  const cal = currentCalendar();
  const clock = openClock(cal, lang);
  const text = lang === 'en' ? clock : `${partOfDay(cal.startMin, lang)} ${clock}`;
  return numerals ? toDevanagari(text) : text;
};

/** "tomorrow from 9:30": when a promised call starts, per language. */
export function promiseWhen(when: 'today' | 'tomorrow' | 'later', lang: WordsLang): string {
  const at = openingAt(lang, lang === 'mr');
  if (lang === 'en') return `${when === 'later' ? callWord(when, 'en') : when} from ${at}`;
  const day = when === 'later' ? callWord(when, lang).replace(/ को$/, '') : callWord(when, lang);
  return `${day} ${at} ${lang === 'mr' ? 'पासून' : 'से'}`;
}

/**
 * When the team promised to confirm a customer's pick: closing time today, or a fixed time on the
 * next working day (`confirmByMin`), "6:30 pm today" / "tomorrow 12 noon" / "Monday 12 noon".
 */
export function confirmByWords(lang: WordsLang): Record<CallDay, string> {
  const cal = currentCalendar();
  const by = confirmByMin(cal);
  if (lang === 'en')
    return {
      today: `${clockText(cal.endMin, 'en')} today`,
      tomorrow: `tomorrow ${clockShort(by, 'en')}`,
      later: `${WEEKDAY_NAMES.en[laterWeekday()]} ${clockShort(by, 'en')}`,
    };
  const num = (text: string) => (lang === 'mr' ? toDevanagari(text) : text);
  const end = `${partOfDay(cal.endMin, lang)} ${num(clockText(cal.endMin, lang))}`;
  const next = `${partOfDay(by, lang)} ${num(clockShort(by, lang))}`;
  return {
    today: `आज ${end}`,
    tomorrow: `${lang === 'mr' ? 'उद्या' : 'कल'} ${next}`,
    later: `${onWeekday(laterWeekday(), lang)} ${next}`,
  };
}
