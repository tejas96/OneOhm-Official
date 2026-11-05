import { describe, expect, it } from 'vitest';
import { QUOTE_QUESTION_LISTS } from '../quotations/quote-question-words';
import { AMC_LISTS } from './amc-words';
import { CALL_WHEN_LISTS } from './call-promise';
import { CARE_FORM_LISTS } from './care-form-words';
import { PROBLEM_KINDS, SINCE_CHOICES } from './care-taps';
import { PROBLEM_LISTS } from './problem-words';
import { RATING_LISTS } from './rating-words';
import { REFER_LISTS } from './refer-words';

const LANGUAGES = ['en', 'mr', 'hi'] as const;

// WhatsApp's limits: reply button 20, list row 24, row description 72, list button 20.
describe.each(LANGUAGES)('customer words in %s', (language) => {
  it('keep every button, row and button label inside WhatsApp limits', () => {
    const P = PROBLEM_LISTS[language];
    const Q = QUOTE_QUESTION_LISTS[language];
    const R = RATING_LISTS[language];
    const buttons = [
      ...SINCE_CHOICES.map((one) => P.since[one]),
      P.done,
      P.yes,
      P.still,
      Q.week,
      Q.month,
      REFER_LISTS[language].shareButton,
      REFER_LISTS[language].upiButton,
      AMC_LISTS[language].renew,
    ];
    for (const title of buttons) expect(title.length, title).toBeLessThanOrEqual(20);
    const rows = [
      ...PROBLEM_KINDS.map((one) => P.what[one]),
      ...Object.values(Q.topics),
      ...R.rows.map((row) => row.title),
      REFER_LISTS[language].otherCity,
    ];
    for (const title of rows) expect(title.length, title).toBeLessThanOrEqual(24);
    for (const row of R.rows) expect(row.description.length).toBeLessThanOrEqual(72);
    for (const label of [P.pick, Q.button, R.button, REFER_LISTS[language].pickCity])
      expect(label.length, label).toBeLessThanOrEqual(20);
    expect(R.section.length).toBeLessThanOrEqual(24);
  });

  it('keep the form words inside Meta limits', () => {
    const F = CARE_FORM_LISTS[language];
    for (const heading of [F.problemHeading, F.referHeading, F.upiHeading])
      expect(heading.length).toBeLessThanOrEqual(80);
    for (const label of [F.friendLabel, F.mobileLabel, F.cityLabel, F.upiLabel])
      expect(label.length, label).toBeLessThanOrEqual(30);
    for (const hint of [F.mobileHint, F.upiHint]) expect(hint.length).toBeLessThanOrEqual(80);
    expect(F.photosHint.length).toBeLessThanOrEqual(300);
    expect(F.send.length).toBeLessThanOrEqual(35);
    for (const one of PROBLEM_KINDS)
      expect(PROBLEM_LISTS[language].what[one].length).toBeLessThanOrEqual(30);
    expect(PROBLEM_LISTS[language].formButton.length).toBeLessThanOrEqual(30);
    expect(REFER_LISTS[language].formButton.length).toBeLessThanOrEqual(30);
  });

  it('say who calls and when', () => {
    expect(CALL_WHEN_LISTS[language].by('4:30 pm')).toContain('4:30 pm');
    expect(RATING_LISTS[language].sorry('Priya', 'X')).toContain('Priya');
    expect(PROBLEM_LISTS[language].reopened('Priya', 'X')).toContain('Priya');
    expect(AMC_LISTS[language].renewed('Priya', 'X')).toContain('Priya');
    expect(REFER_LISTS[language].paid('₹2,000')).toContain('₹2,000');
    expect(REFER_LISTS[language].thanks('Suresh', '₹2,000')).toContain('₹2,000');
    expect(REFER_LISTS[language].thanks('Suresh', null)).not.toContain('₹');
  });
});
