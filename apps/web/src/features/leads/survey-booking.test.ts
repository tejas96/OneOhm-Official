import { describe, expect, it } from 'vitest';
import { hasOpenSurvey, needsSurveyBooking } from './survey-booking';

describe('needsSurveyBooking', () => {
  it('asks for a day when a lead moves to Survey booked with no visit', () => {
    expect(needsSurveyBooking({ stage: 'contacted' }, 'survey_scheduled', [])).toBe(true);
    expect(needsSurveyBooking({ stage: 'quoted' }, 'survey_scheduled', undefined)).toBe(true);
  });
  it('asks again when the earlier visit was cancelled, done or missed', () => {
    const visits = [{ status: 'cancelled' }, { status: 'done' }, { status: 'missed' }] as const;
    expect(needsSurveyBooking({ stage: 'new' }, 'survey_scheduled', visits)).toBe(true);
  });
  it('does not book a second visit when one is waiting', () => {
    expect(hasOpenSurvey([{ status: 'proposed' }])).toBe(true);
    expect(
      needsSurveyBooking({ stage: 'new' }, 'survey_scheduled', [{ status: 'confirmed' }]),
    ).toBe(false);
  });
  it('does not ask for other stages or when the lead is already at Survey booked', () => {
    expect(needsSurveyBooking({ stage: 'new' }, 'contacted', [])).toBe(false);
    expect(needsSurveyBooking({ stage: 'survey_scheduled' }, 'survey_scheduled', [])).toBe(false);
  });
});
