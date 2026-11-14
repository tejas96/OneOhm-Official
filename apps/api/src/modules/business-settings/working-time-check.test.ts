import { DEFAULT_VISIT_SETTINGS } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { holidayErrors, visitErrors, workingTimeErrors } from './working-time-check';

const WORK = {
  weeklyOff: [0],
  dayStart: '09:30',
  dayEnd: '18:30',
  lunchStart: '13:00',
  lunchEnd: '14:00',
  holidays: [{ day: '2026-11-11', name: 'Diwali' }],
};
const V = DEFAULT_VISIT_SETTINGS;

describe('saving working time', () => {
  it('accepts the shipped hours with the shipped visit times', () => {
    expect(workingTimeErrors(WORK, V)).toEqual({});
  });
  it('refuses closing at 17:00 while a 17:00 visit time exists, naming it', () => {
    const errors = workingTimeErrors({ ...WORK, dayEnd: '17:00' }, V);
    expect(errors.dayEnd).toContain('17:00 visit time');
  });
  it('refuses no working day, a closing before opening and lunch outside the hours', () => {
    expect(
      workingTimeErrors({ ...WORK, weeklyOff: [0, 1, 2, 3, 4, 5, 6] }, V).weeklyOff,
    ).toBeDefined();
    expect(workingTimeErrors({ ...WORK, dayEnd: '09:00' }, V).dayEnd).toBeDefined();
    expect(
      workingTimeErrors({ ...WORK, lunchStart: '08:00', lunchEnd: '09:00' }, V).lunchStart,
    ).toBeDefined();
  });
  it('accepts a Saturday off with no lunch', () => {
    expect(
      workingTimeErrors({ ...WORK, weeklyOff: [0, 6], lunchStart: null, lunchEnd: null }, V),
    ).toEqual({});
  });
  it('refuses a holiday listed twice or not a real date', () => {
    const errors = holidayErrors([
      { day: '2026-11-11', name: 'Diwali' },
      { day: '2026-11-11', name: 'Again' },
      { day: '2026-02-31', name: 'Nope' },
    ]);
    expect(errors['holidays.0']).toBeUndefined();
    expect(errors['holidays.1']).toMatch(/already in the list/);
    expect(errors['holidays.2']).toMatch(/real date/);
  });
});

describe('saving visit settings', () => {
  it('accepts the shipped defaults against the shipped hours', () => {
    expect(visitErrors(V, WORK)).toEqual({});
  });
  it('refuses a visit time that no longer fits the saved closing time', () => {
    const errors = visitErrors(V, { ...WORK, dayEnd: '17:00', holidays: [] });
    expect(errors['slotStarts.4']).toMatch(/after closing/);
  });
  it('refuses more days shown than days ahead, and a reminder outside the hours', () => {
    const errors = visitErrors(
      { ...V, daysAhead: 3, daysShown: 5, reminders: { ...V.reminders, dayBeforeAt: '21:00' } },
      WORK,
    );
    expect(errors.daysShown).toBeDefined();
    expect(errors['reminders.dayBeforeAt']).toBeDefined();
  });
});
