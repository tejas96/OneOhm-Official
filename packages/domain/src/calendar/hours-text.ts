import { type BusinessCalendar, DEFAULT_CALENDAR } from './business-calendar';

/** The languages customers are written to. */
export type WordsLang = 'en' | 'mr' | 'hi';

/** Weekday names, 0 = Sunday. */
export const WEEKDAY_NAMES: Record<WordsLang, readonly string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  mr: ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
  hi: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
};

const SHORT_NAMES: Record<WordsLang, readonly string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  mr: ['रवि', 'सोम', 'मंगळ', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
  hi: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
};

/** "on Monday": the weekday as it is said for a day ("सोमवारी" in Marathi). */
export function onWeekday(weekday: number, lang: WordsLang): string {
  const name = WEEKDAY_NAMES[lang][weekday] ?? '';
  if (lang === 'en') return `on ${name}`;
  return lang === 'mr' ? `${name}ी` : name;
}

function twelveHour(minutes: number): { hour: number; minute: string; pm: boolean } {
  const hours = Math.floor(minutes / 60) % 24;
  return {
    hour: hours % 12 === 0 ? 12 : hours % 12,
    minute: String(minutes % 60).padStart(2, '0'),
    pm: hours >= 12,
  };
}

/** A clock time as customers read it: "9:30 am" in English, "9:30" in Marathi and Hindi. */
export function clockText(minutes: number, lang: WordsLang = 'en'): string {
  const { hour, minute, pm } = twelveHour(minutes);
  const base = `${hour}:${minute}`;
  return lang === 'en' ? `${base} ${pm ? 'pm' : 'am'}` : base;
}

/** A clock time said short: "12 noon", "6 pm", "9:30 am". */
export function clockShort(minutes: number, lang: WordsLang = 'en'): string {
  if (lang === 'en' && minutes === 720) return '12 noon';
  const { hour, minute, pm } = twelveHour(minutes);
  if (lang !== 'en') return minute === '00' ? `${hour}` : `${hour}:${minute}`;
  return `${hour}${minute === '00' ? '' : `:${minute}`} ${pm ? 'pm' : 'am'}`;
}

/** A span of the day: "10:00–11:30 am", "11:30 am–1:00 pm" (English); "9:30–6:30" (Marathi, Hindi). */
export function rangeText(startMin: number, endMin: number, lang: WordsLang = 'en'): string {
  if (lang !== 'en') return `${clockText(startMin, lang)}–${clockText(endMin, lang)}`;
  const start = twelveHour(startMin);
  const end = twelveHour(endMin);
  const left = start.pm === end.pm ? `${start.hour}:${start.minute}` : clockText(startMin);
  return `${left}–${clockText(endMin)}`;
}

/** The opening hours: "9:30 am–6:30 pm" (English), "9:30–6:30" (Marathi, Hindi). */
export function hoursText(
  cal: BusinessCalendar = DEFAULT_CALENDAR,
  lang: WordsLang = 'en',
): string {
  return rangeText(cal.startMin, cal.endMin, lang);
}

/** The working weekdays, Monday first: "Mon–Sat", or "Mon, Wed, Fri" when they do not run together. */
export function daysText(cal: BusinessCalendar = DEFAULT_CALENDAR, lang: WordsLang = 'en'): string {
  const order = [1, 2, 3, 4, 5, 6, 0].filter((weekday) => !cal.weeklyOff.includes(weekday));
  const names = SHORT_NAMES[lang];
  const name = (weekday: number) => names[weekday] ?? '';
  const [first] = order;
  const last = order[order.length - 1];
  if (first === undefined || last === undefined) return '';
  const run = [1, 2, 3, 4, 5, 6, 0];
  const contiguous = order.length === run.indexOf(last) - run.indexOf(first) + 1;
  if (order.length >= 3 && contiguous) return `${name(first)}–${name(last)}`;
  return order.map(name).join(', ');
}

/** "Mon–Sat, 9:30 am–6:30 pm" for a one-line "we are here" note. */
export function openingText(cal: BusinessCalendar = DEFAULT_CALENDAR, lang: WordsLang = 'en') {
  return `${daysText(cal, lang)}, ${hoursText(cal, lang)}`;
}

/**
 * The minute by which the team promises to confirm a customer's pick on a later day: two and a
 * half hours after opening (12 noon at the usual 9:30), never after closing.
 */
export const confirmByMin = (cal: BusinessCalendar = DEFAULT_CALENDAR): number =>
  Math.min(cal.startMin + 150, cal.endMin);

const PARTS: Record<'mr' | 'hi', readonly [string, string, string, string]> = {
  mr: ['सकाळी', 'दुपारी', 'संध्याकाळी', 'रात्री'],
  hi: ['सुबह', 'दोपहर', 'शाम', 'रात'],
};

/** "सकाळी" / "सुबह": the part of the day a minute falls in, in Marathi or Hindi. */
export function partOfDay(minutes: number, lang: 'mr' | 'hi'): string {
  const hours = minutes / 60;
  const index = hours < 12 ? 0 : hours < 16 ? 1 : hours < 19 ? 2 : 3;
  return PARTS[lang][index] ?? '';
}

/** Digits 0–9 written as Devanagari numerals (९:३०), as the older Marathi texts do. */
export const toDevanagari = (text: string): string =>
  text.replace(/\d/g, (digit) => String.fromCharCode(0x0966 + Number(digit)));

/**
 * The opening time said after "from": "9:30" for a morning opening (as customers are used to),
 * with am/pm in English for an afternoon one.
 */
export function openClock(
  cal: BusinessCalendar = DEFAULT_CALENDAR,
  lang: WordsLang = 'en',
): string {
  if (lang === 'en' && cal.startMin >= 12 * 60) return clockText(cal.startMin, 'en');
  const { hour, minute } = twelveHour(cal.startMin);
  return `${hour}:${minute}`;
}
