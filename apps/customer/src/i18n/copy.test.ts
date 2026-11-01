import { CUSTOMER_LANGUAGES } from '@oneohm/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { COVER, RATE, VISITS } from '@/copy/after-sales';
import { ALERTS } from '@/copy/alerts';
import { FEEDBACK, REFER, SUPPORT } from '@/copy/care';
import { COMMON, PROFILE, SIGN_IN } from '@/copy/common';
import { FAMILY } from '@/copy/family';
import { HOME, MILESTONE, STAGE_MEANING } from '@/copy/home';
import { BILLING, DOCUMENTS, PAYMENTS } from '@/copy/money';
import { STAGE_RATING } from '@/copy/ratings';
import { REQUEST_MEDIA } from '@/copy/request-media';
import { lookup } from './copy';
import { currentLanguage, dateLocale, setLanguage } from './language';

const MODULES = {
  COVER,
  RATE,
  VISITS,
  ALERTS,
  FEEDBACK,
  REFER,
  SUPPORT,
  COMMON,
  PROFILE,
  SIGN_IN,
  FAMILY,
  HOME,
  MILESTONE,
  STAGE_MEANING,
  BILLING,
  DOCUMENTS,
  PAYMENTS,
  STAGE_RATING,
  REQUEST_MEDIA,
};

/** Every string in a copy module (functions called with sample arguments), with its path. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'function') {
    const sample = (value as (...args: unknown[]) => unknown)('X', 'Y', 'project_created');
    return strings(sample, `${path}()`);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => strings(inner, `${path}.${key}`));
  }
  return [];
}

afterEach(() => setLanguage('en-IN'));

describe('the app in three languages (PRD 5.1)', () => {
  it('reads each string in the language chosen at that moment', () => {
    expect(COMMON.tabs.home).toBe('Home');
    setLanguage('mr-IN');
    expect(currentLanguage()).toBe('mr-IN');
    expect(COMMON.tabs.home).toBe('होम');
    expect(PAYMENTS.payNow('₹40,000')).toBe('₹40,000 आता भरा');
    setLanguage('hi-IN');
    expect(PROFILE.title).toBe('मैं');
    expect(SIGN_IN.form.codeSentTo('+91 90000 00101')).toContain('+91 90000 00101');
  });

  it('says every line in Marathi and Hindi, never empty and never left in English', () => {
    setLanguage('en-IN');
    const english = new Map(strings(MODULES, 'copy'));
    for (const language of CUSTOMER_LANGUAGES.filter((code) => code !== 'en-IN')) {
      setLanguage(language);
      const local = strings(MODULES, 'copy');
      expect(local.map(([path]) => path)).toEqual([...english.keys()]);
      for (const [path, text] of local) {
        expect(text.trim(), `${language} ${path}`).not.toBe('');
        // Brand names, ₹ amounts, units and codes stay as they are; words do not.
        const words = (english.get(path) ?? '').replaceAll('project_created', '');
        if (/[a-z]{4,}/.test(words) && !/[\u0900-\u097F]/.test(text)) {
          expect(['OneOhm', 'WhatsApp', 'UPI', 'PDF'], `${language} ${path}`).toContain(text);
        }
      }
    }
  });

  it('names OneOhm’s own keys in the language and keeps names the team typed', () => {
    setLanguage('mr-IN');
    expect(PAYMENTS.milestone('advance', 'Advance on order confirmation')).toBe(
      'ऑर्डर पक्की झाल्यावर ॲडव्हान्स',
    );
    expect(PAYMENTS.milestone('second_instalment', 'Second instalment')).toBe('Second instalment');
    expect(SUPPORT.category('cleaning', 'Panel cleaning')).toBe('पॅनलची साफसफाई');
    expect(lookup(DOCUMENTS.category, 'warranty')).toBe('वॉरंटी');
    expect(lookup(DOCUMENTS.category, 'toString')).toBeUndefined();
    setLanguage('en-IN');
    expect(PAYMENTS.milestone('advance', 'Advance (custom)')).toBe('Advance (custom)');
  });

  it('formats dates with the language’s month names and the same digits as amounts', () => {
    const date = new Date('2026-11-04T00:00:00Z');
    const format = (language: (typeof CUSTOMER_LANGUAGES)[number]) =>
      new Intl.DateTimeFormat(dateLocale(language), {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(date);
    expect(format('en-IN')).toBe('4 November');
    expect(format('mr-IN')).toBe('4 नोव्हेंबर');
    expect(format('hi-IN')).toBe('4 नवंबर');
  });
});
