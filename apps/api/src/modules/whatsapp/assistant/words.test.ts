import {
  DEFAULT_ONBOARDING,
  MAX_BILL_BANDS,
  MAX_ROW_TITLE,
  MAX_SERVICE_CITIES,
  STEP_ORDER,
} from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import type { ChatReply } from '../chat-store';
import { ONBOARD_LISTS } from '../onboarding/onboard-words';
import { laterQuestion, question } from '../onboarding/onboarding-replies';
import { assistantLanguage, inLanguage } from './language';
import { EN, MEDIA_WORDS, MENU_ROWS, RATINGS, WORDS } from './words';
import { HI } from './words-hi';
import { MR } from './words-mr';

const LISTS = { en: EN, mr: MR, hi: HI };

describe('assistant words in three languages', () => {
  it('answers in the language of the message being handled', async () => {
    expect(await inLanguage('mr', async () => WORDS.menuButton)).toBe('निवडा');
    expect(await inLanguage('hi', async () => MENU_ROWS[0]?.title)).toBe('प्रोजेक्ट की प्रगति');
    expect(await inLanguage('en', async () => WORDS.menuButton)).toBe('Choose');
    expect(WORDS.menuButton).toBe('Choose');
  });

  it('keeps the same menu choices, in the same order, in every language', () => {
    for (const words of [MR, HI])
      expect(words.MENU_ROWS.map((row) => row.id)).toEqual(EN.MENU_ROWS.map((row) => row.id));
  });

  // WhatsApp refuses a list row title over 24, a description over 72, a button over 20.
  it('fits WhatsApp’s limits in every language', () => {
    for (const [language, words] of Object.entries(LISTS)) {
      for (const row of [...words.MENU_ROWS, ...words.RATINGS]) {
        expect(row.title.length, `${language} ${row.title}`).toBeLessThanOrEqual(24);
        expect(row.description.length, `${language} ${row.description}`).toBeLessThanOrEqual(72);
      }
      for (const button of [
        words.WORDS.payNow,
        words.WORDS.callMeBack,
        words.WORDS.menuButton,
        words.WORDS.quoteYes,
        words.WORDS.quoteNotYet,
        words.MEDIA_WORDS.reportProblem,
        words.MEDIA_WORDS.talkToPerson,
      ])
        expect(button.length, `${language} ${button}`).toBeLessThanOrEqual(20);
    }
  });

  it('picks the customer’s saved language', () => {
    expect(assistantLanguage('mr-IN')).toBe('mr');
    expect(assistantLanguage('hi-IN')).toBe('hi');
    expect(assistantLanguage('en-IN')).toBe('en');
    expect(assistantLanguage(null)).toBe('en');
  });

  it('is a working list in Marathi for ratings and media', async () => {
    await inLanguage('mr', async () => {
      expect(RATINGS.map((rating) => rating.id)).toEqual(EN.RATINGS.map((rating) => rating.id));
      expect(MEDIA_WORDS.ask('फोटो')).toContain('फोटो');
    });
  });
});

describe('hand-over and night words', () => {
  it('names the person in every language, and falls back to the team', () => {
    for (const words of [EN, MR, HI]) {
      expect(words.WORDS.passedToOwner('Asha')).toContain('Asha');
      expect(words.WORDS.nightReply('Asha')).toContain('Asha');
      expect(words.WORDS.passedToOwner(null)).not.toContain('null');
      expect(words.WORDS.nightReply(null)).not.toContain('null');
    }
  });
});

describe('onboarding questions', () => {
  // The longest lists an owner can set: 8 cities (+ Other + a person) and 9 bill bands.
  const settings = {
    ...DEFAULT_ONBOARDING,
    serviceCities: Array.from({ length: MAX_SERVICE_CITIES }, (_, i) =>
      `City ${i}`.padEnd(MAX_ROW_TITLE, 'x'),
    ),
    billBands: Array.from({ length: MAX_BILL_BANDS }, (_, i) => ({
      id: `band_${i}`,
      label: `Band ${i}`.padEnd(MAX_ROW_TITLE, 'x'),
      targetWp: 1000,
    })),
  };

  function fits(reply: ChatReply, label: string) {
    if (reply.kind === 'buttons') {
      expect(reply.buttons.length, label).toBeLessThanOrEqual(3);
      for (const button of reply.buttons)
        expect(button.title.length, `${label} ${button.title}`).toBeLessThanOrEqual(20);
    }
    if (reply.kind === 'list') {
      expect(reply.rows.length, label).toBeLessThanOrEqual(10);
      expect(reply.button.length, label).toBeLessThanOrEqual(20);
      for (const row of reply.rows)
        expect(row.title.length, `${label} ${row.title}`).toBeLessThanOrEqual(24);
    }
  }

  const choicesOf = (reply: ChatReply) =>
    reply.kind === 'buttons' ? reply.buttons : reply.kind === 'list' ? reply.rows : [];

  /** Every question, in every way it can be asked, in one language. */
  const allQuestions = (language: 'en' | 'mr' | 'hi') =>
    inLanguage(language, async () =>
      STEP_ORDER.flatMap((step) =>
        ([undefined, 'name', 'city'] as const).map((awaiting) => ({
          step,
          reply: question(step, { settings, profileName: 'Asha', awaiting, retry: true }),
        })),
      ),
    );

  it('fits WhatsApp’s limits and offers a person on every question, in every language', async () => {
    for (const language of ['en', 'mr', 'hi'] as const)
      for (const { step, reply } of await allQuestions(language)) {
        fits(reply, `${language} ${step}`);
        if (step === 'language') continue;
        // The estimate's buttons keep "Talk to a person" in the middle.
        const offered = choicesOf(reply).map((choice) => choice.id);
        if (step === 'done') expect(offered, `${language} done`).toContain('ob:person');
        else expect(offered.at(-1), `${language} ${step}`).toBe('ob:person');
      }
  });

  it('fits the "Not now" list and the estimate words in every language', async () => {
    for (const language of ['en', 'mr', 'hi'] as const) {
      const later = await inLanguage(language, async () => laterQuestion());
      fits(later, `${language} later`);
      expect(choicesOf(later).at(-1)?.id).toBe('ob:person');
      const words = ONBOARD_LISTS[language];
      // A document caption holds 1024 characters.
      const caption = words.estimateCaption('10 kWp', '₹10,00,00,000', '₹10,00,00,000');
      expect(caption.length, `${language} caption`).toBeLessThanOrEqual(1024);
      expect(words.willCall('Asha')).toContain('Asha');
    }
    expect(ONBOARD_LISTS.en.estimateCaption('3 kW', '₹1', '₹1')).toContain(
      'Estimate — final price in your quotation after a free call or visit',
    );
  });

  it('has file replies in every language that fit a WhatsApp text', () => {
    for (const [language, words] of Object.entries(ONBOARD_LISTS))
      for (const text of [words.firstDetails, words.billThanks, words.badFile]) {
        expect(text.length, `${language} file reply`).toBeGreaterThan(0);
        expect(text.length, `${language} file reply`).toBeLessThanOrEqual(1024);
      }
    expect(ONBOARD_LISTS.mr.billThanks).not.toBe(ONBOARD_LISTS.en.billThanks);
    expect(ONBOARD_LISTS.hi.firstDetails).not.toBe(ONBOARD_LISTS.en.firstDetails);
  });

  it('has the same words in every language', () => {
    for (const words of [ONBOARD_LISTS.mr, ONBOARD_LISTS.hi])
      expect(Object.keys(words).sort()).toEqual(Object.keys(ONBOARD_LISTS.en).sort());
    expect(ONBOARD_LISTS.mr.askName('Asha')).toContain('Asha');
  });
});
