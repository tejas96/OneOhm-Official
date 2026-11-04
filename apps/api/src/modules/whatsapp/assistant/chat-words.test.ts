import { describe, expect, it } from 'vitest';
import {
  BUTTON_MAX,
  CHAT_LISTS,
  DESCRIPTION_MAX,
  fitTitle,
  LANGUAGE_BUTTONS,
  ROW_MAX,
  talkTitle,
} from './chat-words';
import { inLanguage } from './language';
import { PAPER_LISTS } from './paper-words';
import { EN } from './words';
import { HI } from './words-hi';
import { MR } from './words-mr';

const LANGUAGES = ['en', 'mr', 'hi'] as const;

/** Every key path of a words object, so each language is checked to say the same things. */
const shape = (value: unknown, path = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, inner]) => shape(inner, `${path}.${key}`))
    : [path];

describe('the chat dictionary (redesign §1: WhatsApp limits)', () => {
  it('says the same things in English, Marathi and Hindi', () => {
    for (const language of ['mr', 'hi'] as const)
      expect(shape(CHAT_LISTS[language]).sort()).toEqual(shape(CHAT_LISTS.en).sort());
  });

  it('keeps every button within 20 characters, in every language', () => {
    for (const language of LANGUAGES) {
      const words = CHAT_LISTS[language];
      const buttons = [
        ...Object.values(words.buttons),
        words.listButton,
        // Every list's open button: Choose (homes, ratings), Choose a paper, See them.
        { en: EN, mr: MR, hi: HI }[language].WORDS.menuButton,
        PAPER_LISTS[language].button,
        words.pay('₹99,99,999'),
        ...LANGUAGE_BUTTONS.map((button) => button.title),
      ];
      for (const title of buttons)
        expect(title.length, `${language} "${title}"`).toBeLessThanOrEqual(BUTTON_MAX);
    }
  });

  it('keeps every More row within 24 and its help line within 72, and has 10 rows', () => {
    for (const language of LANGUAGES) {
      const rows = Object.values(CHAT_LISTS[language].more.rows);
      expect(rows).toHaveLength(10);
      for (const row of rows) {
        expect(row.title.length, `${language} "${row.title}"`).toBeLessThanOrEqual(ROW_MAX);
        expect(row.description.length, `${language} "${row.description}"`).toBeLessThanOrEqual(
          DESCRIPTION_MAX,
        );
      }
      const home = CHAT_LISTS[language].home;
      for (const line of [home.paperRow(null), home.quoteRow])
        expect(line.length, `${language} "${line}"`).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });

  it('names the person on Talk to, within the limit, else says our team', async () => {
    for (const language of LANGUAGES)
      await inLanguage(language, async () => {
        const words = CHAT_LISTS[language];
        for (const name of ['Priya', 'Priya Deshmukh', 'Venkatalakshmi', null]) {
          const button = talkTitle(name);
          const row = talkTitle(name, ROW_MAX);
          expect(button.length, `${language} "${button}"`).toBeLessThanOrEqual(BUTTON_MAX);
          expect(row.length, `${language} "${row}"`).toBeLessThanOrEqual(ROW_MAX);
        }
        expect(talkTitle('Priya Deshmukh')).toBe(words.talkTo('Priya'));
        expect(talkTitle(null)).toBe(words.buttons.talkTeam);
        expect(talkTitle('Venkatalakshmi')).toBe(words.buttons.talkTeam);
      });
    expect(CHAT_LISTS.en.talkTo('Priya')).toBe('Talk to Priya');
  });

  it('says who replies and when, in hours and outside them', () => {
    const en = CHAT_LISTS.en;
    expect(en.talkReply('Priya', 'now')).toBe('Priya will reply here soon (Mon–Sat, 9:30–6:30).');
    expect(en.talkReply('Priya', 'tomorrow')).toBe('Priya will reply here tomorrow from 9:30.');
    expect(en.talkReply(null, 'monday')).toBe('Our team will reply here on Monday from 9:30.');
    expect(en.nightReply('Priya', 'monday')).toBe(
      'Thank you. Your message is with Priya, who will reply here on Monday from 9:30.',
    );
    expect(en.handedBack('Priya')).toBe('Priya is away now — we’re here to help.');
    for (const language of LANGUAGES) {
      const words = CHAT_LISTS[language];
      for (const text of [
        words.talkReply('Priya', 'now'),
        words.passed('Priya', 'today'),
        words.passedUnknown('Priya', 'monday'),
        words.handedBack('Priya'),
        words.nightReply('Priya', 'monday'),
        words.home.noProject('Priya', 'tomorrow'),
      ])
        expect(text, language).toContain('Priya');
      expect(words.passed(null, 'now'), language).not.toContain('null');
    }
  });
  it('cuts a long title between whole letters, never inside a Devanagari letter', () => {
    expect(fitTitle('Electricity bill for the farm house', 24)).toBe('Electricity bill for th…');
    const cut = fitTitle('वीज बिल आणि मालमत्ता कागदपत्रे सर्व', 24);
    expect(cut.length).toBeLessThanOrEqual(24);
    // The last kept letter is whole: "कागदपत्रे" is never cut between क and its sign.
    expect(cut.slice(0, -1).normalize()).toBe(cut.slice(0, -1));
    expect(/[ा-्]$/u.test(cut.slice(0, -1)) || /[क-ह]$/u.test(cut.slice(0, -1))).toBe(true);
    expect(fitTitle('पावती', 24)).toBe('पावती');
    // "कागदपत्रे" in 5: "का" and "ग" whole, never "क" without its sign.
    expect(fitTitle('कागदपत्रे', 4)).toBe('काग…');
    expect(fitTitle('कागदपत्रे', 3)).toBe('का…');
  });
});
