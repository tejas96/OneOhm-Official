import { describe, expect, it } from 'vitest';
import { amcEndsOn, amcState, scheduleVisits, visitCount, visitsToOpen } from './amc-schedule';
import {
  categoryKeyFrom,
  DEFAULT_SERVICE_CATEGORIES,
  SERVICE_CATEGORY_KEY_PATTERN,
} from './service-categories';
import { serviceSla, slaAlertStage, slaBreached, slaDueDates, slaState } from './service-sla';
import { addMonths, coverEnds, warrantyFor, warrantyState } from './warranty';

describe('warranty dates', () => {
  it('adds months and keeps the day, or the last day of a shorter month', () => {
    expect(addMonths('2026-11-01', 12)).toBe('2027-11-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('ends cover the day before the anniversary', () => {
    expect(coverEnds('2026-11-01', 5)).toBe('2031-10-31');
    expect(coverEnds('2026-11-01', 1)).toBe('2027-10-31');
  });

  it('gives panels a product and a performance warranty from commissioning', () => {
    expect(warrantyFor('panel', '2026-11-01')).toEqual({
      startsOn: '2026-11-01',
      endsOn: '2036-10-31',
      performanceEndsOn: '2051-10-31',
    });
    expect(warrantyFor('workmanship', '2026-11-01').endsOn).toBe('2027-10-31');
    expect(warrantyFor('inverter', '2026-11-01').performanceEndsOn).toBeNull();
  });

  it('uses the owner’s policy', () => {
    const policy = {
      panel: { years: 12, performanceYears: 30 },
      inverter: { years: 7, performanceYears: null },
      battery: { years: 8, performanceYears: null },
      structure: { years: 10, performanceYears: null },
      workmanship: { years: 2, performanceYears: null },
    };
    expect(warrantyFor('inverter', '2026-11-01', policy).endsOn).toBe('2033-10-31');
  });

  it('flags cover that ends within 90 days, and cover that has ended', () => {
    expect(warrantyState('2027-10-31', '2026-11-01')).toBe('active');
    expect(warrantyState('2027-01-15', '2026-11-01')).toBe('ending_soon');
    expect(warrantyState('2026-10-31', '2026-11-01')).toBe('ended');
  });
});

describe('AMC visits', () => {
  it('ends the contract the day before its length runs out', () => {
    expect(amcEndsOn('2026-11-01', 12)).toBe('2027-10-31');
    expect(amcEndsOn('2026-11-01', 24)).toBe('2028-10-31');
  });

  it('counts visits over the whole contract', () => {
    expect(visitCount({ visitsPerYear: 4, durationMonths: 12 })).toBe(4);
    expect(visitCount({ visitsPerYear: 4, durationMonths: 24 })).toBe(8);
    expect(visitCount({ visitsPerYear: 2, durationMonths: 6 })).toBe(1);
    expect(visitCount({ visitsPerYear: 0, durationMonths: 12 })).toBe(0);
  });

  it('spreads visits evenly, each in the middle of its part of the year', () => {
    expect(scheduleVisits('2027-01-01', '2027-12-31', 4)).toEqual([
      '2027-02-15',
      '2027-05-17',
      '2027-08-17',
      '2027-11-16',
    ]);
    expect(scheduleVisits('2027-01-01', '2027-12-31', 2)).toEqual(['2027-04-02', '2027-10-01']);
    expect(scheduleVisits('2027-01-01', '2026-12-31', 2)).toEqual([]);
  });

  it('opens visits a week ahead, once, and never for a day that has passed', () => {
    const visits = [
      { dueOn: '2026-11-01', opened: false },
      { dueOn: '2026-11-08', opened: false },
      { dueOn: '2026-11-09', opened: false },
      { dueOn: '2026-11-05', opened: true },
      { dueOn: '2026-10-30', opened: false },
    ];
    expect(visitsToOpen(visits, '2026-11-01').map((visit) => visit.dueOn)).toEqual([
      '2026-11-01',
      '2026-11-08',
    ]);
  });

  it('says whether a contract has started, is running, ended or was cancelled', () => {
    const contract = { startsOn: '2026-11-10', endsOn: '2027-11-09', cancelled: false };
    expect(amcState(contract, '2026-11-01')).toBe('upcoming');
    expect(amcState(contract, '2026-11-10')).toBe('active');
    expect(amcState(contract, '2027-11-10')).toBe('ended');
    expect(amcState({ ...contract, cancelled: true }, '2026-11-12')).toBe('cancelled');
  });
});

describe('service levels', () => {
  const raised = new Date('2026-11-01T04:00:00Z');
  const at = (hours: number) => new Date(raised.getTime() + hours * 3_600_000);

  it('sets due times from the category hours', () => {
    const due = slaDueDates({ responseHours: 4, resolutionHours: 48 }, raised);
    expect(due.responseDueAt).toEqual(at(4));
    expect(due.resolutionDueAt).toEqual(at(48));
  });

  it('starts a visit’s resolution clock on the visit day in India', () => {
    const due = slaDueDates({ responseHours: 48, resolutionHours: 24 }, raised, '2026-11-08');
    expect(due.resolutionDueAt.toISOString()).toBe('2026-11-08T18:30:00.000Z');
  });

  it('is on track, then due soon in the last quarter, then breached', () => {
    const clock = { startedAt: raised, dueAt: at(8), doneAt: null };
    expect(slaState(clock, at(1))).toBe('on_track');
    expect(slaState(clock, at(6))).toBe('due_soon');
    expect(slaState(clock, at(9))).toBe('breached');
    expect(slaState({ ...clock, dueAt: null }, at(9))).toBeNull();
  });

  it('is met or missed once done', () => {
    expect(slaState({ startedAt: raised, dueAt: at(8), doneAt: at(7) }, at(20))).toBe('met');
    expect(slaState({ startedAt: raised, dueAt: at(8), doneAt: at(9) }, at(20))).toBe('missed');
  });

  it('counts resolving as answering, and keeps a visit on track until its day', () => {
    const request = {
      createdAt: raised,
      responseDueAt: at(4),
      respondedAt: null,
      resolutionDueAt: at(48),
      resolvedAt: at(2),
      scheduledFor: null,
    };
    expect(serviceSla(request, at(50))).toEqual({ response: 'met', resolution: 'met' });
    const visit = {
      ...request,
      resolvedAt: null,
      respondedAt: at(1),
      resolutionDueAt: new Date('2026-11-08T18:30:00Z'),
      scheduledFor: '2026-11-08',
    };
    expect(serviceSla(visit, at(24)).resolution).toBe('on_track');
  });

  it('alerts on due soon and breached only, and filters breached requests', () => {
    expect(slaAlertStage('due_soon')).toBe('due_soon');
    expect(slaAlertStage('breached')).toBe('breached');
    expect(slaAlertStage('met')).toBeNull();
    expect(slaBreached({ response: 'missed', resolution: 'met' })).toBe(true);
    expect(slaBreached({ response: 'due_soon', resolution: 'on_track' })).toBe(false);
  });
});

describe('service categories', () => {
  it('ships valid, unique keys with the maintenance visit kept for OneOhm', () => {
    const keys = DEFAULT_SERVICE_CATEGORIES.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => SERVICE_CATEGORY_KEY_PATTERN.test(key))).toBe(true);
    expect(DEFAULT_SERVICE_CATEGORIES.filter((category) => category.system)).toHaveLength(1);
  });

  it('makes a key from a new category’s name', () => {
    expect(categoryKeyFrom('Meter shifting')).toBe('meter_shifting');
    expect(categoryKeyFrom('  Wi-Fi / monitoring! ')).toBe('wi_fi_monitoring');
    expect(categoryKeyFrom('24x7 help')).toBe('c_24x7_help');
  });
});
