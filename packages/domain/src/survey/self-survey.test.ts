import { describe, expect, it } from 'vitest';
import { nextActionStatus } from '../documents/customer-actions';
import { checkReminderTiming, DEFAULT_REMINDER_TIMING } from '../settings/reminder-timing';
import { checkSurveyCredit, isOption, missingItems, offerPaise, surveyFacts } from './self-survey';

describe('the self survey (redesign §7)', () => {
  it('asks in order and only for the consumer number a home lacks', () => {
    expect(missingItems({}, [], false)).toEqual([
      'roof',
      'floors',
      'corner_a',
      'corner_b',
      'meter',
      'board',
      'shade',
      'size',
      'consumer',
    ]);
    expect(missingItems({}, [], true)).not.toContain('consumer');
    const done = { roof: 'rcc', floors: '2', shade: 'none', size: 's2' };
    expect(missingItems(done, ['corner_a', 'corner_b', 'meter'], true)).toEqual(['board']);
    expect(
      missingItems({ ...done, consumer: '123' }, ['corner_a', 'corner_b', 'meter', 'board'], false),
    ).toEqual([]);
  });

  it('knows its options and writes the report fields', () => {
    expect(isOption('roof', 'rcc')).toBe(true);
    expect(isOption('roof', 'glass')).toBe(false);
    expect(isOption('size', 'unknown')).toBe(true);
    expect(surveyFacts({ roof: 'tin', floors: '2', shade: 'lot', size: 's3' })).toEqual({
      site_floors: '2',
      structure_type: 'Tin shed',
      self_survey_shade: 'A lot of shade',
      self_survey_roof_size: '600 to 1000 sq ft',
    });
  });

  it('offers nothing when the offer is off and refuses odd credits', () => {
    expect(offerPaise({ selfSurveyOffer: true, selfSurveyPaise: 100_000 })).toBe(100_000);
    expect(offerPaise({ selfSurveyOffer: false, selfSurveyPaise: 100_000 })).toBe(0);
    expect(checkSurveyCredit(100_000)).toBeNull();
    expect(checkSurveyCredit(0)).not.toBeNull();
    expect(checkSurveyCredit(150)).not.toBeNull();
    expect(checkReminderTiming({ ...DEFAULT_REMINDER_TIMING, selfSurveyPaise: 50 })).toHaveProperty(
      'selfSurveyPaise',
    );
  });

  it('is a checked action: sent, then approved or asked again', () => {
    expect(nextActionStatus('self_survey', 'open', 'customer_did_it')).toBe('received');
    expect(nextActionStatus('self_survey', 'received', 'looks_good')).toBe('closed');
    expect(nextActionStatus('self_survey', 'received', 'ask_again')).toBe('open');
  });
});
